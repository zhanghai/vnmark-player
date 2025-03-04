import { Property } from './ElementProperties';
import { ElementPropertyMatcher } from './ElementPropertyMatcher';
import { Engine, EngineError } from './Engine';

export interface Command {
  name: string;
  argumentCount: number;

  execute(engine: Engine, arguments_: string[]): Promise<boolean>;
}

const COMMAND_ARRAY: Command[] = [
  {
    name: 'eval',
    argumentCount: 1,
    async execute(engine, arguments_): Promise<boolean> {
      const [script] = arguments_;
      engine.evaluateScript(script);
      return true;
    },
  },
  {
    name: 'exec',
    argumentCount: 1,
    async execute(engine, arguments_): Promise<boolean> {
      const [fileName] = arguments_;
      await engine.setDocument(fileName);
      return false;
    },
  },
  {
    name: 'exit',
    argumentCount: 0,
    async execute(engine): Promise<boolean> {
      engine.updateState(it => {
        it.nextLineIndex = engine.document.lines.length;
      });
      return false;
    },
  },
  {
    name: 'jump',
    argumentCount: 1,
    async execute(engine, arguments_): Promise<boolean> {
      const [labelName] = arguments_;
      const labelIndex = engine.document.labelIndices.get(labelName);
      if (labelIndex === undefined) {
        throw new EngineError(`Unknown label "${labelName}"`);
      }
      engine.updateState(it => {
        it.nextLineIndex = labelIndex;
      });
      return false;
    },
  },
  {
    name: 'jump_if',
    argumentCount: 2,
    async execute(engine, arguments_): Promise<boolean> {
      const [labelName, condition] = arguments_;
      const labelIndex = engine.document.labelIndices.get(labelName);
      if (labelIndex === undefined) {
        throw new EngineError(`Unknown label "${labelName}"`);
      }
      const conditionValue = engine.evaluateScript(condition);
      if (conditionValue) {
        engine.updateState(it => {
          it.nextLineIndex = labelIndex;
        });
        return false;
      } else {
        return true;
      }
    },
  },
  {
    name: 'label',
    argumentCount: 1,
    async execute(): Promise<boolean> {
      return true;
    },
  },
  {
    name: 'pause',
    argumentCount: 0,
    async execute(engine) {
      return await engine.updateView({ type: 'pause' });
    },
  },
  {
    name: 'set_property',
    argumentCount: 3,
    async execute(engine, arguments_) {
      const [elementName, propertyName, propertyValue] = arguments_;
      validateName(elementName);
      validateName(propertyName);
      const { type, index, name, value } = Property.parse(
        elementName,
        propertyName,
        propertyValue,
      );
      const canonicalElementName = index ? `${type}${index}` : type;
      engine.updateState(it => {
        const element = it.elements[canonicalElementName];
        if (value.type === 'initial') {
          // @ts-expect-error TS7053
          if (element && element[name]) {
            // @ts-expect-error TS7053
            delete element[name];
            if (Object.keys(element).length === 2) {
              delete it.elements[canonicalElementName];
            }
          }
        } else {
          if (element) {
            // @ts-expect-error TS7053
            element[name] = value;
          } else {
            it.elements[canonicalElementName] = {
              type,
              ...(index && { index }),
              [name]: value,
            };
          }
        }
      });
      // State won't be updated to view until a suspension point.
      return true;
    },
  },
  {
    name: 'sleep',
    argumentCount: 1,
    async execute(engine, arguments_) {
      const [durationMillisString] = arguments_;
      const durationMillis = Number(durationMillisString);
      if (Number.isNaN(durationMillis)) {
        throw new EngineError(
          `Cannot parse duration millis "${durationMillisString}"`,
        );
      }
      if (!Number.isInteger(durationMillis) || durationMillis < 0) {
        throw new EngineError(
          `Duration millis ${durationMillis} is not a non-negative integer`,
        );
      }
      return await engine.updateView({ type: 'sleep', durationMillis });
    },
  },
  {
    name: 'snap',
    argumentCount: 1,
    async execute(engine, arguments_) {
      const [elementPropertyNames] = arguments_;
      if (!elementPropertyNames) {
        throw new EngineError(`Empty element properties to snap`);
      }
      const elementPropertyMatcher =
        ElementPropertyMatcher.parse(elementPropertyNames);
      return await engine.updateView({
        type: 'snap',
        elementPropertyMatcher,
      });
    },
  },
  {
    name: 'wait',
    argumentCount: 1,
    async execute(engine, arguments_) {
      const [elementPropertyNames] = arguments_;
      if (!elementPropertyNames) {
        throw new EngineError(`Empty element properties to snap`);
      }
      const elementPropertyMatcher =
        ElementPropertyMatcher.parse(elementPropertyNames);
      return await engine.updateView({
        type: 'wait',
        elementPropertyMatcher,
      });
    },
  },
];

function validateName(name: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new EngineError(`Invalid name "${name}"`);
  }
}

export const COMMANDS: Map<string, Command> = new Map(
  COMMAND_ARRAY.map(it => [it.name, it]),
);
