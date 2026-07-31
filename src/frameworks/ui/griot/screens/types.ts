import {
  AppState,
  GriotController,
} from "../../../../adapters/presenters/GriotController";
import { GriotTheme } from "../theme";

/** The four ways material enters the app from the capture screen. */
export type CaptureIntent = "note" | "paste" | "link" | "ask";

/** Every deck screen needs the same three things: the controller, its state, and the theme. */
export interface SharedProps {
  controller: GriotController;
  state: AppState;
  theme: GriotTheme;
}
