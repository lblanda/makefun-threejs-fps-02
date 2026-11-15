// Keyboard and mouse input for SANDLINE. Pointer lock owns the mouse;
// the game never needs a click handler on a button while locked. Every
// frame the sim reads a plain snapshot: move axes, look deltas and edge
// events (pressed this tick), so input never leaks into the sim's state.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.mouseDown = false;
    this.mousePressed = false; // edge: pressed since last take()
    this.locked = false;
    this.onLockChange = null;
    this.onKey = null; // (code) => void, for menu keys the sim does not own
    this._onKeyDown = (e) => this._keyDown(e);
    this._onKeyUp = (e) => this._keyUp(e);
    this._onMouseDown = (e) => this._mouseDown(e);
    this._onMouseUp = () => { this.mouseDown = false; };
    this._onMouseMove = (e) => this._mouseMove(e);
    this._onLock = () => this._lockChange();
    this._onBlur = () => { this.keys.clear(); this.mouseDown = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLock);
    window.addEventListener('blur', this._onBlur);
  }

  _keyDown(e) {
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat) {
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e.code);
    }
  }

  _keyUp(e) {
    this.keys.delete(e.code);
  }

  _mouseDown(e) {
    if (e.button !== 0) return;
    this.mouseDown = true;
    this.mousePressed = true;
  }

  _mouseMove(e) {
    if (!this.locked) return;
    this.lookDX += e.movementX || 0;
    this.lookDY += e.movementY || 0;
  }

  _lockChange() {
    this.locked = document.pointerLockElement === this.canvas;
    if (this.onLockChange) this.onLockChange(this.locked);
  }

  lock() {
    if (!this.locked) this.canvas.requestPointerLock();
  }

  unlock() {
    if (this.locked) document.exitPointerLock();
  }

  // Snapshot for one sim tick. lookDX/lookDY and mousePressed reset here.
  take() {
    const k = this.keys;
    const snap = {
      forward: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
      strafe: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      crouch: k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC'),
      jump: k.has('Space'),
      interact: k.has('KeyE'),
      reload: k.has('KeyR'),
      grenade: k.has('KeyG'),
      lookDX: this.lookDX,
      lookDY: this.lookDY,
      firing: this.mouseDown,
      fired: this.mousePressed,
      digit: k.has('Digit1') ? 1 : k.has('Digit2') ? 2 : k.has('Digit3') ? 3 : 0,
    };
    this.lookDX = 0;
    this.lookDY = 0;
    this.mousePressed = false;
    return snap;
  }
}
