import { HitAction } from "./values";

/**
 * A single SVG path within an Entity, valid during a time range.
 */
export interface EntityPath
{
    /** Unique identifier, auto-generated */
    id: string;
    /** Start of visibility range in ms (0 for images) */
    frame_time_start_ms: number;
    /** End of visibility range in ms (0 = until end of video, 0 for images) */
    frame_time_end_ms: number;
    /** SVG path data string */
    path: string;
}

/**
 * A logical entity (e.g. "atacante", "rehén") with shared hit properties
 * and one or more SVG paths across different time ranges.
 */
export interface Entity
{
    /** Unique identifier, auto-generated */
    id: string;
    /** Display name, e.g. "atacante 1", "rehén" */
    name: string;
    /** Action triggered when this entity is hit */
    hit_action: HitAction;
    /** Score awarded (can be negative) */
    score: number;
    /** Next scene ID if hit_action is NEXT */
    next_scene_id: string;
    /** SVG paths belonging to this entity */
    paths: EntityPath[];
}

/**
 * A single scene (file) consisting of multiple entities.
 */
export interface HitFile
{
    /** Unique identifier, auto-generated */
    id: string;
    /** Path to the video or image file */
    file_path: string;
    /** Timeout duration (in seconds) */
    timeout_sec: number;
    /** Action when timeout occurs */
    timeout_action: HitAction;
    /** Entities within this file */
    entities: Entity[];
    /** Video settings or null for images */
    video_settings:
    {
        /** Whether the video loops */
        loop: boolean;
    } | null;
}

/**
 * A complete scenario consisting of multiple scenes (files).
 */
export interface HitScenario
{
    /** Unique identifier, auto-generated */
    id: string;
    /** Title of the scenario */
    title: string;
    /** Description of the scenario */
    description: string;
    /** Width of the coordinate space used when annotating paths (original media width) */
    viewbox_w: number;
    /** Height of the coordinate space used when annotating paths (original media height) */
    viewbox_h: number;
    /** Array of HitFiles (scenes) */
    files: HitFile[];
}
