/**
 * # Web Citation
 *
 * ## Business Value & Purpose
 * One source a *provider's own* web search actually returned for a model turn — a URL
 * and the title it came back with, nothing more.
 *
 * This lives in `entities/` under a neutral name (rather than beside any one feature)
 * because more than one capability now receives them: goal planning and the workspace
 * agent both surface provider citations, and a type named after whichever feature got
 * there first would have to be re-homed the moment that feature is retired.
 *
 * ## What it is not
 * Not a saved research candidate. The app's own `SearchGateway`/`ResearchWorkflow` path
 * produces results the user keeps, rejects, and extracts; a `WebCitation` is only a
 * receipt saying "the model consulted this". The two must stay visibly distinct in the
 * UI — merging them would make it impossible to say which search actually ran.
 */
export interface WebCitation {
  url: string;
  /** The provider's title for the page. Falls back to the URL when none was supplied. */
  title: string;
}
