// What the scenes are, in words, by ADS script, and by tag where it says
// more than the script's name

import type { NowPlaying } from './engine/ads';

const SCENES: Record<string, { name: string; tags?: Record<number, string> }> = {
    'ACTIVITY.ADS': { name: 'Passing the time', tags: {
        1: 'Diving', 4: 'Diving', 5: 'A visit from the natives', 9: 'A visit from the natives',
        6: 'Reading', 7: 'Reading', 10: 'Reading', 12: 'Reading', 8: 'Taking a bath', 11: 'Taking a bath',
    } },
    'BUILDING.ADS': { name: 'Making do', tags: {
        1: 'Building a sandcastle', 2: 'The Lilliputians', 4: 'The Lilliputians', 6: 'The Lilliputians',
        3: 'Taking a nap', 5: 'Building a fire', 9: 'Building a fire', 7: 'Dinner time', 8: 'Dinner time',
    } },
    'FISHING.ADS': { name: 'Fishing', tags: { 3: 'The eight-armed menace' } },
    'JOHNNY.ADS': { name: 'Johnny', tags: {
        1: 'The end', 2: 'A message in a bottle', 3: 'The last message', 4: 'Finding a bottle',
        5: 'Throwing a bottle', 6: 'Meanwhile, at work',
    } },
    'MARY.ADS': { name: 'Mary', tags: {
        1: 'The date', 2: 'Johnny glimpses Mary', 3: 'Johnny asks Mary out',
        4: 'Johnny and Mary break up', 5: 'Johnny leaves',
    } },
    'MISCGAG.ADS': { name: 'Island life', tags: { 1: 'Hot summer days', 2: 'Shark!' } },
    'STAND.ADS': { name: 'Taking in the view', tags: { 15: 'Looking through the telescope', 16: 'Looking through the telescope' } },
    'SUZY.ADS': { name: 'Suzy', tags: { 1: 'Suzy in the city', 2: 'Johnny meets Suzy' } },
    'VISITOR.ADS': { name: 'Visitors', tags: { 3: 'A ship goes by', 4: 'Coconuts', 6: 'Coconuts', 7: 'Coconuts' } },
    'WALKSTUF.ADS': { name: 'Out and about', tags: { 2: 'Working on the raft', 3: 'Jogging' } },
};


// Eg. "Fishing", "Walking", or '' for the intro
export function describeScene(np: NowPlaying) {
    switch (np.activity) {
        case 'walk':
            return 'Walking';
        case 'scene': {
            const scene = SCENES[np.adsName];
            return scene?.tags?.[np.adsTag] ?? scene?.name ?? np.description;
        }
        default:
            return '';
    }
}
