import AsyncStorage from "@react-native-async-storage/async-storage";
import { KeyValueStore } from "./KeyValueStore";

/**
 * The one place in the app that touches AsyncStorage. Kept in its own module so that
 * importing a repository never drags React Native into a plain Node/Bun test process.
 */
export const asyncStorageKeyValueStore: KeyValueStore = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
