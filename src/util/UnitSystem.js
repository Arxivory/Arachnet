// Constants for conversion (Base is ALWAYS 1 Meter)
const METERS_TO_KM = 0.001;
const METERS_TO_MILES = 0.000621371;
const METERS_TO_FEET = 3.28084;
const METERS_TO_INCHES = 39.3701;
const METERS_TO_CM = 100;
const RACK_UNIT_METERS = 0.04445; // 1 Rack Unit (U) = 44.45mm

export const PIXELS_PER_METER = 50; // Assuming 1 grid square = 50px = 1 meter

export const GridScale = {
  toMeters: (pixels) => {
    return pixels / PIXELS_PER_METER;
  },
  toPixels: (meters) => {
    return meters * PIXELS_PER_METER;
  }
};

export const UnitSystem = {
  
  toEngine: (value, currentUnit) => {
    switch(currentUnit) {
      case 'km': return value / METERS_TO_KM;
      case 'mi': return value / METERS_TO_MILES;
      case 'cm': return value / METERS_TO_CM;
      case 'ft': return value / METERS_TO_FEET;
      case 'in': return value / METERS_TO_INCHES;
      case 'U': return value * RACK_UNIT_METERS;
      default: return value; // Assumes 'm' (meters)
    }
  },

  toDisplay: (meters, targetUnit) => {
    switch(targetUnit) {
      case 'km': return meters * METERS_TO_KM;
      case 'mi': return meters * METERS_TO_MILES;
      case 'cm': return meters * METERS_TO_CM;
      case 'ft': return meters * METERS_TO_FEET;
      case 'in': return meters * METERS_TO_INCHES;
      case 'U': return meters / RACK_UNIT_METERS;
      default: return meters; // Assumes 'm' (meters)
    }
  },

  format: (meters, targetUnit) => {
    const converted = UnitSystem.toDisplay(meters, targetUnit);
    const rounded = Math.round(converted * 100) / 100;
    return `${rounded} ${targetUnit}`;
  }
};