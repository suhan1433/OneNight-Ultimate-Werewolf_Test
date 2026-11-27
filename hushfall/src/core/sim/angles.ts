const sin = Array.from({ length: 360 }, (_, i) => Math.sin(i * Math.PI / 180));
export const trig = (degrees: number) => sin[((Math.round(degrees) % 360) + 360) % 360];
