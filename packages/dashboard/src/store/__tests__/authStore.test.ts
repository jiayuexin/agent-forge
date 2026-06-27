import { useAuthStore } from '../authStore.js';

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null });
  });

  it('sets and clears token', () => {
    useAuthStore.getState().setToken('test-token');
    expect(useAuthStore.getState().token).toBe('test-token');

    useAuthStore.getState().clearToken();
    expect(useAuthStore.getState().token).toBeNull();
  });
});
