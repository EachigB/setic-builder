/**
 * Enumeration of possible actions that can be taken when a hit is detected.
 */
export enum HitAction
{
    /** No action */
    NONE = 0,
    /** Increase score */
    SCORE = 1,
    /** Move to the next scene */
    NEXT = 2,
    /** Lose the game */
    LOSE = 3,
    /** Win the game */
    WIN = 4,
}