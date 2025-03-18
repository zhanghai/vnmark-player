import { ELEMENT_TYPES, ElementType } from '../engine';
import { Transition } from '../transition';
import { Arrays2, Maps } from '../util';
import { Ticker } from './Ticker';
import { ViewError } from './View';

const LAYOUT_TRANSITION_DURATION = 1000;

export class Layout {
  private readonly layoutNames: string[];
  private readonly elementLayouts: Map<HTMLElement, string[]>;
  private readonly layoutTypeElements: Map<
    string,
    Map<ElementType, HTMLElement>
  >;
  readonly pointerElement: HTMLElement;

  private layoutName = 'none';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly transitions: Transition<any>[] = [];

  constructor(
    readonly rootElement: HTMLElement,
    private readonly ticker: Ticker,
  ) {
    const layoutNameSet = new Set<string>();
    this.elementLayouts = new Map();
    forEachDescendantElement(rootElement, element => {
      const layoutNames = getElementLayoutNames(element);
      if (layoutNames.length) {
        if (!layoutNames.includes('none')) {
          setElementOpacity(element, 0);
        }
        this.elementLayouts.set(element, layoutNames);
        layoutNames.forEach(it => layoutNameSet.add(it));
        return false;
      } else {
        return true;
      }
    });
    layoutNameSet.add('none');
    this.layoutNames = Array.from(layoutNameSet).sort();

    this.layoutTypeElements = new Map();
    forEachDescendantElement(rootElement, element => {
      const elementType = element.dataset.type;
      if (!elementType) {
        return true;
      }
      if (!ELEMENT_TYPES.includes(elementType)) {
        throw new ViewError(`Unknown element type "${elementType}"`);
      }
      const layoutNames =
        firstNonUndefinedOfAncestorElementsOrUndefined(
          element,
          rootElement,
          it => {
            const layoutNames = getElementLayoutNames(it);
            return layoutNames.length ? layoutNames : undefined;
          },
        ) ?? this.layoutNames;
      for (const layoutName of layoutNames) {
        const typeElements = Maps.getOrSet(
          this.layoutTypeElements,
          layoutName,
          () => new Map(),
        );
        if (typeElements.has(elementType)) {
          throw new ViewError(
            `Duplicate type "${elementType}" element for layout "${layoutName}"`,
          );
        }
        typeElements.set(elementType, element);
      }
      return false;
    });

    const pointerElement = firstDescendantElementOrUndefined(
      rootElement,
      it => it.dataset.id === 'pointer',
    );
    if (!pointerElement) {
      throw new ViewError('Missing pointer element');
    }
    this.pointerElement = pointerElement;
  }

  getElement(
    layoutName: string,
    elementType: ElementType,
  ): HTMLElement | undefined {
    return this.layoutTypeElements.get(layoutName)?.get(elementType);
  }

  *transition(layoutName: string): Generator<ElementType[], void, void> {
    if (!this.layoutNames.includes(layoutName)) {
      throw new ViewError(`Unknown layout "${layoutName}"`);
    }

    const oldLayoutName = this.layoutName;
    const newLayoutName = layoutName;
    this.layoutName = layoutName;

    if (oldLayoutName === newLayoutName) {
      yield [];
      return;
    }

    const exitElements: HTMLElement[] = [];
    const enterElements: HTMLElement[] = [];
    for (const [element, layoutNames] of this.elementLayouts) {
      const isInOldLayout = layoutNames.includes(oldLayoutName);
      const isInNewLayout = layoutNames.includes(newLayoutName);
      if (isInOldLayout === isInNewLayout) {
        continue;
      }
      if (isInOldLayout) {
        exitElements.push(element);
      } else {
        enterElements.push(element);
      }
    }

    if (exitElements.length) {
      for (const exitElement of exitElements) {
        this.transitionElement(exitElement, 0, LAYOUT_TRANSITION_DURATION);
      }
    }

    const exitElementTypes: ElementType[] = [];
    const oldTypeElements = this.layoutTypeElements.get(oldLayoutName);
    if (oldTypeElements) {
      const newTypeElements = this.layoutTypeElements.get(newLayoutName);
      for (const [elementType, oldElement] of oldTypeElements) {
        const newElement = newTypeElements?.get(elementType);
        if (oldElement !== newElement) {
          exitElementTypes.push(elementType);
        }
      }
    }
    yield exitElementTypes;

    if (enterElements.length) {
      for (const enterElement of enterElements) {
        this.transitionElement(enterElement, 1, LAYOUT_TRANSITION_DURATION);
      }
    }
  }

  private transitionElement(
    element: HTMLElement,
    opacity: number,
    transitionDuration: number,
  ) {
    const transition = new Transition(
      getElementOpacity(element),
      opacity,
      transitionDuration,
    )
      .addOnUpdateCallback(it => setElementOpacity(element, it))
      .addOnEndCallback(() => {
        Arrays2.remove(this.transitions, transition);
        this.ticker.removeCallback(transition);
      });
    this.transitions.push(transition);
    this.ticker.addCallback(transition, it => transition.update(it));
    transition.start();
  }

  async wait(): Promise<void> {
    await Promise.all(this.transitions.map(it => it.asPromise()));
  }

  snap() {
    for (const transition of this.transitions) {
      transition.cancel();
    }
  }
}

function forEachDescendantElement(
  elementExclusive: HTMLElement,
  action: (element: HTMLElement) => boolean,
) {
  for (const childElement of elementExclusive.children) {
    if (!(childElement instanceof HTMLElement)) {
      continue;
    }
    if (action(childElement)) {
      forEachDescendantElement(childElement, action);
    }
  }
}

function firstDescendantElementOrUndefined(
  elementExclusive: HTMLElement,
  predicate: (element: HTMLElement) => boolean,
): HTMLElement | undefined {
  for (const childElement of elementExclusive.children) {
    if (!(childElement instanceof HTMLElement)) {
      continue;
    }
    if (predicate(childElement)) {
      return childElement;
    }
    const result = firstDescendantElementOrUndefined(childElement, predicate);
    if (result) {
      return result;
    }
  }
  return undefined;
}

function firstNonUndefinedOfAncestorElementsOrUndefined<Result>(
  elementInclusive: HTMLElement,
  rootElementExclusive: HTMLElement,
  transform: (element: HTMLElement) => Result | undefined,
): Result | undefined {
  let element: HTMLElement | null = elementInclusive;
  do {
    const result = transform(element);
    if (result !== undefined) {
      return result;
    }
    element = element.parentElement;
  } while (element && element !== rootElementExclusive);
  return undefined;
}

function getElementLayoutNames(element: HTMLElement): string[] {
  const layoutNamesString = element.dataset.layout?.trim();
  if (!layoutNamesString) {
    return [];
  }
  return layoutNamesString.split('[\t\n\f\r ]+').sort();
}

function getElementOpacity(element: HTMLElement): number {
  if (element.style.visibility === 'hidden') {
    return 0;
  }
  const opacity = element.style.opacity;
  return opacity ? Number.parseFloat(opacity) : 1;
}

function setElementOpacity(element: HTMLElement, opacity: number) {
  if (opacity === 0) {
    element.style.visibility = 'hidden';
  } else {
    element.style.removeProperty('visibility');
  }
  if (opacity === 0 || opacity === 1) {
    element.style.removeProperty('opacity');
  } else {
    element.style.opacity = opacity.toString();
  }
}
