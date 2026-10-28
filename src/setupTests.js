import '@testing-library/jest-dom';

jest.mock('three/examples/jsm/controls/OrbitControls', () => ({
  OrbitControls: class {
    constructor(camera, element) {
      this.camera = camera;
      this.element = element;
      this.target = { copy: jest.fn() };
      this.addEventListener = jest.fn();
      this.removeEventListener = jest.fn();
      this.update = jest.fn();
      this.dispose = jest.fn();
    }
  },
}));
