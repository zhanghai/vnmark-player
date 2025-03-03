import {produce, WritableDraft} from 'immer';
import {QuickJSWASMModule, Scope, shouldInterruptAfterDeadline} from 'quickjs-emscripten';
import * as VnmarkParser from 'vnmark-parser';
import {
  BatchedElementsLine,
  CommandLine,
  Document as ParserDocument,
  ElementLine,
  Line,
  LiteralValue,
  Name,
  NodeType,
  QuotedValue,
  ScriptValue,
  Value,
} from 'vnmark-parser/vnmark.d';

import {Package} from '../package';
import {COMMANDS} from './Command';
import {ElementProperties} from './ElementProperties';

export class EngineError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const METADATA_DEFAULTS = {
  width: 1280,
  height: 720,
  batched_elements: ['name', 'avatar', 'text', 'voice'],
  blank_line: [
    ': wait background*, figure*, foreground*, avatar*, name*, text*, choice*, voice*',
    ': snap background*, figure*, foreground*, avatar*, name*, text*, choice*, voice*',
    ': pause',
  ]
}

export class Document {
  private constructor(
    readonly document: ParserDocument,
    readonly lines: Line[],
    readonly batchedElementNames: Name[],
    readonly blankLineLines: Line[],
    readonly labelIndices: Map<string, number>,
  ) {}

  static parse(source: string): Document {
    const document = VnmarkParser.parse(source, {grammarSource: source});

    const lines = document.body?.lines ?? [];

    const metadata = {...document.frontMatter.metadata, METADATA_DEFAULTS};
    const batchedElements = metadata['batched_elements'] as (string[] | undefined) ?? [];
    const batchedElementNames: Name[] = batchedElements.map(it =>
      ({
        type: NodeType.Name,
        location: {
          source: it,
          start: {offset: 0, line: 1, column: 1},
          end: {offset: it.length, line: 1, column: it.length + 1},
        },
        value: it,
      })
    );

    const blankLine = metadata['blank_line'] as (string[] | undefined) ?? [];
    const blankLineLines = blankLine.map(it =>
      VnmarkParser.parse(it, {grammarSource: it, startRule: 'Line'})
    );

    const labelIndices = new Map<string, number>();
    for (const [index, line] of document.body?.lines.entries() ?? []) {
      if (line.type == 'CommandLine') {
        const commandLine = line as CommandLine;
        if (commandLine.name.value === 'label') {
          const arguments_ = commandLine.arguments.map(it => {
            switch (it.type) {
              case NodeType.LiteralValue:
                return (it as LiteralValue).value;
              case NodeType.QuotedValue:
                return (it as QuotedValue).value;
              case NodeType.ScriptValue:
                throw new EngineError(
                  `Unsupported script value in label command "${getLineSource(line)}"`
                );
              default:
                throw new EngineError(`Unexpected value type "${it.type}"`);
            }
          });
          if (arguments_.length !== 1) {
            throw new EngineError(
              `Invalid number of arguments for label command ${getLineSource(line)}, expected 1"`
            );
          }
          const [labelName] = arguments_;
          labelIndices.set(labelName, index);
        }
      }
    }

    return new Document(document, lines, batchedElementNames, blankLineLines, labelIndices);
  }
}

export interface State {
  readonly fileName: string;
  readonly nextLineIndex: number;
  readonly elements: Readonly<Record<string, ElementProperties>>;
  readonly scriptStates: Record<string, unknown>;
}

export type ViewUpdater = (options: UpdateViewOptions) => Promise<boolean>;

export type UpdateViewOptions =
  { type: 'pause' }
  | { type: 'sleep', durationMillis: number }
  | { type: 'snap', elementProperties: string }
  | { type: 'wait', elementProperties: string };

export class Engine {
  public viewUpdater: ViewUpdater | undefined;

  private _state!: State;

  get state(): State {
    return this._state;
  }

  private _document!: Document;

  get document(): Document {
    return this._document;
  }

  constructor(
    readonly package_: Package,
    private readonly quickJs: QuickJSWASMModule,
  ) {}

  async execute(state?: Partial<State>) {
    const fileName = state?.fileName ?? this.package_.manifest.entrypoint;
    this._state = {
      fileName,
      nextLineIndex: 0,
      elements: {},
      scriptStates: {},
    };

    try {
      await this.setDocument(fileName);
      this._state = {...this._state, ...state};

      while (true) {
        const lines = this._document.lines;
        const lineIndex = this._state.nextLineIndex;
        if (lineIndex >= lines.length) {
          break;
        }
        const line = lines[lineIndex];
        let moveToNextLine: boolean;
        try {
          moveToNextLine = await this.executeLine(line);
        } catch (e) {
          throw new EngineError(`Error when executing line "${getLineSource(line)}"`, {cause: e});
        }
        if (moveToNextLine) {
          this.updateState(it => it.nextLineIndex = lineIndex + 1);
        }
      }
    } finally {
      // @ts-expect-error TS2322
      this._state = undefined;
      // @ts-expect-error TS2322
      this._document = undefined;
    }
  }

  private async executeLine(line: Line): Promise<boolean> {
    switch (line.type) {
      case NodeType.CommentLine:
        return true;
      case NodeType.BlankLine:
        return await this.executeBlankLine();
      case NodeType.ElementLine:
        return await this.executeElementLine(line as ElementLine);
      case NodeType.BatchedElementsLine:
        return await this.executeBatchedElementsLine(line as BatchedElementsLine);
      case NodeType.CommandLine:
        return await this.executeCommandLine(line as CommandLine);
      default:
        throw new EngineError(`Unexpected line type "${line.type}"`);
    }
  }

  private async executeBlankLine(): Promise<boolean> {
    for (const commandLine of this._document.blankLineLines) {
      if (!await this.executeLine(commandLine)) {
        return false;
      }
    }
    return true;
  }

  private async executeElementLine(line: ElementLine): Promise<boolean> {
    for (const property of line.properties) {
      const commandName: Name = {
        type: NodeType.Name,
        location: line.location,
        value: 'set_property',
      };
      const elementName: LiteralValue = {
        type: NodeType.LiteralValue,
        location: line.location,
        value: line.name.value,
      }
      const propertyName: LiteralValue = {
        type: NodeType.LiteralValue,
        location: line.location,
        value: property.name?.value ?? 'value',
      };
      const commandLine: CommandLine = {
        type: NodeType.CommandLine,
        location: line.location,
        comment: null,
        name: commandName,
        arguments: [
          elementName,
          propertyName,
          property.value
        ],
      };
      if (!await this.executeCommandLine(commandLine)) {
        return false;
      }
    }
    return true;
  }

  private async executeBatchedElementsLine(line: BatchedElementsLine): Promise<boolean> {
    const batchedElementNames = this._document.batchedElementNames;
    if (line.batchedProperties.length !== batchedElementNames.length) {
      throw new EngineError(
        `Invalid number of elements for batched elements line, expected` +
        ` "${batchedElementNames.map(it => it.value).join(', ')}"`
      );
    }
    for (const [index, properties] of line.batchedProperties.entries()) {
      const elementLine: ElementLine = {
        type: NodeType.ElementLine,
        location: line.location,
        comment: null,
        name: batchedElementNames[index],
        properties,
      };
      if (!await this.executeElementLine(elementLine)) {
        return false;
      }
    }
    return true;
  }

  private async executeCommandLine(line: CommandLine): Promise<boolean> {
    const commandName = line.name.value;
    const command = COMMANDS.get(commandName);
    if (!command) {
      throw new EngineError(`Unsupported command "${commandName}"`);
    }
    const arguments_ = line.arguments.map(it => this.getValue(it));
    if (arguments_.length !== command.argumentCount) {
      throw new EngineError(`Invalid number of arguments, expected ${command.argumentCount}`);
    }
    return await command.execute(this, arguments_);
  }

  private getValue(value: Value): string {
    switch (value.type) {
      case NodeType.LiteralValue:
        return (value as LiteralValue).value;
      case NodeType.QuotedValue:
        return (value as QuotedValue).value;
      case NodeType.ScriptValue:
        return String(this.evaluateScript((value as ScriptValue).script));
      default:
        throw new EngineError(`Unexpected value type "${value.type}"`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evaluateScript(script: string): any {
    try {
      return Scope.withScope(scope => {
        const context = scope.manage(this.quickJs.newContext());
        const runtime = context.runtime;
        runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + 1000));
        runtime.setMemoryLimit(1024 * 1024);
        const scriptStatesHandle =
          scope.manage(
            context.unwrapResult(context.evalCode(`(${JSON.stringify(this._state.scriptStates)})`))
          );
        context.defineProp(
          context.global,
          '$',
          {
            enumerable: true,
            value: scriptStatesHandle,
          }
        );
        const value = context.dump(scope.manage(context.unwrapResult(context.evalCode(script))));
        const newScriptStates = context.dump(scope.manage(context.getProp(context.global, '$')));
        this.updateState(it => it.scriptStates = newScriptStates);
        return value;
      });
    } catch (e) {
      throw new EngineError(`Error when evaluating script "${script}"`, {cause: e});
    }
  }

  getBlob(type: string, name: string): Blob {
    const file = `${type}/${name}`;
    let blob;
    if (file in this.package_.files) {
      blob = this.package_.getBlob(file);
    } else {
      const exactFile = this.package_.files.find(it => it.startsWith(`${file}.`));
      if (exactFile) {
        blob = this.package_.getBlob(exactFile);
      }
    }
    if (!blob) {
      throw new EngineError(`Cannot find file with type "${type}" and name "${name}"`);
    }
    return blob;
  }

  async setDocument(name: string) {
    const blob = this.getBlob('vnmark', name);
    const source = await blob.text();
    this._document = Document.parse(source);
    this.updateState(it => {
      it.fileName = name;
      it.nextLineIndex = 0;
    });
  }

  updateState(recipe: (draft: WritableDraft<State>) => void) {
    this._state = produce(this._state, it => { recipe(it); });
  }

  async updateView(options: UpdateViewOptions): Promise<boolean> {
    const moveToNextLine = await this.viewUpdater?.(options) ?? true;
    // Elements with value set to 'none' should be reset, i.e. removed. But we should do this after
    // updating view so that transition properties can still apply to a change to 'none'.
    this.updateState(it => {
      for (const [elementName, element] of Object.entries(it.elements)) {
        if (element.value === undefined || element.value.type === 'none') {
          delete it.elements[elementName];
        }
      }
    });
    return moveToNextLine;
  }
}

function getLineSource(line: Line): string {
  const location = line.location;
  return (location.source as string).substring(location.start.offset, location.end.offset);
}
