const x: number = 34;

export const innerFunc = (param: number): string => {
  return `Innerfunc: ${param}`;
};

console.log("inner", innerFunc(x));
