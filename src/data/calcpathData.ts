// Copyright (C) 2019 Jeremie GUILLAUME. Part of 'Johnny Reborn', ported from
// stranded's calcpath_data.h

export const NUM_OF_NODES = 6;
export const UNDEF_NODE   = 6;

// walkMatrix[from][current][next]: whether Johnny, at the current spot after
// coming from another one, can walk on to the next one
export const walkMatrix: number[][][] = [

      //  A  B  C  D  E  F

    // from A
    [   [ 0, 0, 0, 0, 0, 0 ],  // A
        [ 0, 0, 1, 0, 0, 0 ],  // B
        [ 0, 0, 0, 1, 0, 0 ],  // C
        [ 0, 0, 0, 0, 0, 0 ],  // D
        [ 0, 0, 0, 1, 0, 1 ],  // E
        [ 0, 0, 0, 0, 0, 0 ],  // F
    ],

    // from B
    [   [ 0, 0, 0, 0, 1, 0 ],  // A
        [ 0, 0, 0, 0, 0, 0 ],  // B
        [ 0, 0, 0, 1, 0, 0 ],  // C
        [ 0, 0, 0, 0, 0, 0 ],  // D
        [ 0, 0, 0, 0, 0, 0 ],  // E
        [ 0, 0, 0, 0, 0, 0 ],  // F
    ],

    // from C
    [   [ 0, 0, 0, 0, 1, 0 ],  // A
        [ 1, 0, 0, 0, 0, 0 ],  // B
        [ 0, 0, 0, 0, 0, 0 ],  // C
        [ 0, 0, 0, 0, 1, 0 ],  // D
        [ 0, 0, 0, 0, 0, 0 ],  // E
        [ 0, 0, 0, 0, 0, 0 ],  // F
    ],

    // from D
    [   [ 0, 0, 0, 0, 0, 0 ],  // A
        [ 0, 0, 0, 0, 0, 0 ],  // B
        [ 1, 1, 0, 0, 0, 1 ],  // C
        [ 0, 0, 0, 0, 0, 0 ],  // D
        [ 1, 0, 0, 0, 0, 0 ],  // E
        [ 0, 0, 0, 0, 1, 0 ],  // F
    ],

    // from E
    [   [ 0, 1, 1, 0, 0, 0 ],  // A
        [ 0, 0, 0, 0, 0, 0 ],  // B
        [ 0, 0, 0, 0, 0, 0 ],  // C
        [ 0, 0, 1, 0, 0, 0 ],  // D
        [ 0, 0, 0, 0, 0, 0 ],  // E
        [ 0, 0, 0, 1, 0, 0 ],  // F
    ],

    // from F
    [   [ 0, 0, 0, 0, 0, 0 ],  // A
        [ 0, 0, 0, 0, 0, 0 ],  // B
        [ 0, 0, 0, 1, 0, 0 ],  // C
        [ 0, 0, 0, 0, 0, 0 ],  // D
        [ 1, 0, 0, 0, 0, 0 ],  // E
        [ 0, 0, 0, 0, 0, 0 ],  // F
    ],

    // from any spot
    [   [ 0, 1, 1, 0, 1, 1 ],  // A
        [ 1, 0, 1, 0, 0, 0 ],  // B
        [ 1, 1, 0, 1, 1, 1 ],  // C
        [ 0, 0, 1, 0, 1, 1 ],  // D
        [ 1, 0, 1, 1, 0, 1 ],  // E
        [ 1, 0, 1, 1, 1, 0 ],  // F
    ],
];
