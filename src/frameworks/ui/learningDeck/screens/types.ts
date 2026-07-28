import {
  AppState,
  LearnimalController,
} from "../../../../adapters/presenters/LearnimalController";
import { LearningTheme } from "../theme";

/** The four ways material enters the app from the capture screen. */
export type CaptureIntent = "note" | "paste" | "link" | "ask";

/** Every deck screen needs the same three things: the controller, its state, and the theme. */
export interface SharedProps {
  controller: LearnimalController;
  state: AppState;
  theme: LearningTheme;
}
