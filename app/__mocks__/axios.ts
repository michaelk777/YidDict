// Manual mock for axios used in Jest tests.
// Tests configure responses with mockResolvedValueOnce / mockRejectedValueOnce.
const axios = {
  post: jest.fn(),
  get: jest.fn(),
  create: jest.fn(() => axios),
  defaults: { headers: { common: {} } },
};

export default axios;
