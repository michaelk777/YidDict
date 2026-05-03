// Manual mock for axios used in Jest tests.
// Tests configure responses with mockResolvedValueOnce / mockRejectedValueOnce.

interface AxiosMock {
  post: jest.Mock;
  get: jest.Mock;
  create: jest.Mock<AxiosMock>;
  defaults: { headers: { common: Record<string, string> } };
}

const axios: AxiosMock = {
  post: jest.fn(),
  get: jest.fn(),
  create: jest.fn(() => axios),
  defaults: { headers: { common: {} } },
};

export default axios;
