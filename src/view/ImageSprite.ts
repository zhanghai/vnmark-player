import {
  Matrix,
  ObservablePoint,
  PointData,
  Sprite,
  SpriteOptions,
  Texture,
} from 'pixi.js';

import { ImageElementResolvedProperties } from './ElementResolvedProperties';
import { ViewError } from './View';

export class ImageSprite extends Sprite {
  constructor(options?: SpriteOptions | Texture) {
    super(options);
  }

  private _valueAlpha = 1;

  private _propertyAlpha = 1;

  get valueAlpha(): number {
    return this._valueAlpha;
  }

  set valueAlpha(value: number) {
    this._valueAlpha = value;
    this.alpha = this._valueAlpha * this._propertyAlpha;
  }

  get propertyAlpha(): number {
    return this._propertyAlpha;
  }

  set propertyAlpha(value: number) {
    this._propertyAlpha = value;
    this.alpha = this._valueAlpha * this._propertyAlpha;
  }

  private _absoluteAnchor = new ObservablePoint(this);

  get absoluteAnchor(): ObservablePoint {
    return this._absoluteAnchor;
  }

  set absoluteAnchor(value: PointData | number) {
    if (typeof value === 'number') {
      this._absoluteAnchor.set(value);
    } else {
      this._absoluteAnchor.copyFrom(value);
    }
  }

  private _offset = new ObservablePoint(this);

  get offset(): ObservablePoint {
    return this._offset;
  }

  set offset(value: PointData | number) {
    if (typeof value === 'number') {
      this.pivot.set(value);
    } else {
      this.pivot.copyFrom(value);
    }
  }

  // Ignore the point parameter
  _onUpdate() {
    super._onUpdate();
  }

  updateLocalTransform() {
    const localTransformChangeId = this._didContainerChangeTick;
    if (this['_didLocalTransformChangeId'] === localTransformChangeId) {
      return;
    }
    this['_didLocalTransformChangeId'] = localTransformChangeId;
    // https://drafts.csswg.org/css-transforms-2/#ctm
    const localTransform = this.localTransform;
    const pivot = this.pivot;
    const scale = this.scale;
    const skew = this.skew;
    const rotation = this.rotation;
    const anchor = this.absoluteAnchor;
    const position = this.position;
    const offset = this.offset;
    // These operations are prepending the transformation matrices, so we apply them in reverse
    // order compared to the spec.
    localTransform
      .identity()
      .translate(-pivot.x, -pivot.y)
      .scale(scale.x, scale.y);
    skewMatrix(localTransform, skew.x, skew.y)
      .rotate(rotation)
      .translate(-anchor.x, -anchor.y)
      .translate(position.x, position.y)
      .translate(offset.x, offset.y)
      .translate(pivot.x, pivot.y);
  }

  getPropertyValue(
    propertyName: keyof ImageElementResolvedProperties,
  ): ImageElementResolvedProperties[typeof propertyName] {
    switch (propertyName) {
      case 'value':
        return this.valueAlpha;
      case 'anchorX':
        return this.absoluteAnchor.x;
      case 'anchorY':
        return this.absoluteAnchor.y;
      case 'positionX':
        return this.position.x;
      case 'positionY':
        return this.position.y;
      case 'offsetX':
        return this.offset.x;
      case 'offsetY':
        return this.offset.y;
      case 'pivotX':
        return this.pivot.x;
      case 'pivotY':
        return this.pivot.y;
      case 'scaleX':
        return this.scale.x;
      case 'scaleY':
        return this.scale.y;
      case 'skewX':
        return this.skew.x;
      case 'skewY':
        return this.skew.y;
      case 'rotation':
        return this.rotation;
      case 'alpha':
        return this.propertyAlpha;
      default:
        throw new ViewError(`Unknown property "${propertyName}"`);
    }
  }

  setPropertyValue(
    propertyName: keyof ImageElementResolvedProperties,
    propertyValue: ImageElementResolvedProperties[typeof propertyName],
  ) {
    switch (propertyName) {
      case 'value':
        this.valueAlpha = propertyValue;
        break;
      case 'anchorX':
        this.absoluteAnchor.x = propertyValue;
        break;
      case 'anchorY':
        this.absoluteAnchor.y = propertyValue;
        break;
      case 'positionX':
        this.position.x = propertyValue;
        break;
      case 'positionY':
        this.position.y = propertyValue;
        break;
      case 'offsetX':
        this.offset.x = propertyValue;
        break;
      case 'offsetY':
        this.offset.y = propertyValue;
        break;
      case 'pivotX':
        this.pivot.x = propertyValue;
        break;
      case 'pivotY':
        this.pivot.y = propertyValue;
        break;
      case 'scaleX':
        this.scale.x = propertyValue;
        break;
      case 'scaleY':
        this.scale.y = propertyValue;
        break;
      case 'skewX':
        this.skew.x = propertyValue;
        break;
      case 'skewY':
        this.skew.y = propertyValue;
        break;
      case 'rotation':
        this.rotation = propertyValue;
        break;
      case 'alpha':
        this.propertyAlpha = propertyValue;
        break;
      default:
        throw new ViewError(`Unknown property "${propertyName}"`);
    }
  }
}

function skewMatrix(matrix: Matrix, x: number, y: number): Matrix {
  const tanx = Math.tan(x);
  const tany = Math.tan(y);
  const a1 = matrix.a;
  const c1 = matrix.c;
  const tx1 = matrix.tx;
  matrix.a = a1 + matrix.b * tanx;
  matrix.b = a1 * tany + matrix.b;
  matrix.c = c1 + matrix.d * tanx;
  matrix.d = c1 * tany + matrix.d;
  matrix.tx = tx1 + matrix.ty * tanx;
  matrix.ty = tx1 * tany + matrix.ty;
  return matrix;
}
