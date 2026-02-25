/**
 * Recorded step from the browser (click, type, goto, etc.).
 * Used by the recorder and exporters.
 */

export type RecordedAction =
  | 'goto'
  | 'click'
  | 'doubleClick'
  | 'rightClick'
  | 'type'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'hover'
  | 'wait'
  | 'assertText'
  | 'assertAttribute'
  | 'dialog'
  | 'switchTab';

export interface RecordedStep {
  action: RecordedAction;
  /** CSS/XPath selector or empty for goto. */
  selector?: string;
  /** For type: typed value. For select: value or label. */
  value?: string;
  /** For goto: URL. For assertText/assertAttribute: expected value. */
  url?: string;
  /** For wait: milliseconds. */
  ms?: number;
  /** For assertText/assertAttribute: expected value (alias for value when action is assert). */
  expected?: string;
  /** For assertAttribute: attribute name (e.g. value, href). */
  attributeName?: string;
  /** For dialog: 'accept' | 'dismiss'. */
  behavior?: 'accept' | 'dismiss';
  /** For dialog (prompt): text to send. */
  promptText?: string;
  /** For switchTab: 0-based tab index. */
  index?: number;
}
