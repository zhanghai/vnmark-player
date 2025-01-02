import bezier from 'bezier-easing';

export const VnmarkEasing = {
  Css: {
    Ease: bezier(0.25, 0.1, 0.25, 1.0),
    EaseIn: bezier(0.42, 0, 1.0, 1.0),
    EaseOut: bezier(0, 0, 0.58, 1.0),
    EaseInOut: bezier(0.42, 0, 0.58, 1.0),
  },
  Material3: {
    Standard: bezier(0.2, 0.0, 0, 1.0),
    StandardDecelerate: bezier(0, 0, 0, 1),
    StandardAccelerate: bezier(0.3, 0, 1, 1),
  },
};
