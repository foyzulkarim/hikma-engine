/**
 * Mock for @xenova/transformers module
 */

const mockPipeline = jest.fn().mockImplementation((task, model) => {
  return Promise.resolve({
    // Mock embedding pipeline
    async: jest.fn().mockResolvedValue([
      Array.from({ length: 384 }, () => Math.random() - 0.5)
    ]),
    // Mock text generation pipeline
    generate: jest.fn().mockResolvedValue([{
      generated_text: 'Mock generated summary text'
    }])
  });
});

const mockEnv = {
  backends: {
    onnx: {
      wasm: {
        numThreads: 1
      }
    }
  },
  allowLocalModels: false,
  allowRemoteModels: false
};

module.exports = {
  pipeline: mockPipeline,
  env: mockEnv
};
