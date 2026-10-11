import * as SecureStore from 'expo-secure-store';
const key = 'campusflow.session.v1';
export const sessionStorage = {
  read: () => SecureStore.getItemAsync(key),
  write: (value: string) => SecureStore.setItemAsync(key, value),
  clear: () => SecureStore.deleteItemAsync(key),
};
