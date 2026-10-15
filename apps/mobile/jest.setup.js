// Icon fonts load asynchronously and only add act() noise to behavior tests.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
