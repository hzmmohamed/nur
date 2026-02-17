const test = {
  src: fromCallback(() => {}),
  input: ({ context }) => ({
    layerRef: context.layers.currentMask,
  }),
};
