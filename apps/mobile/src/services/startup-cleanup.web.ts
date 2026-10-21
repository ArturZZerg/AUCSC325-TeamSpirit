import { clearAllCache } from './cache';

// Web sessions live only in a tab's memory, so a new tab never owns cached data.
// Clear what a closed tab left behind before anyone can sign in on this browser.
export function clearUnownedDeviceData() { return clearAllCache(); }
