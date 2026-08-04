import { Roundtable } from "../../../entities/roundtable";

/**
 * # Roundtable Repository Port
 *
 * ## Business Value & Purpose
 * Persists the panels a user has assembled, so a roundtable built for one conversation is
 * there for the next one. A panel that had to be rebuilt every time would not be worth
 * naming.
 */
export interface RoundtableRepository {
  getRoundtables(): Promise<Roundtable[]>;
  saveRoundtable(roundtable: Roundtable): Promise<void>;
  /** Removes the grouping only. The member profiles are their own records and survive. */
  deleteRoundtable(id: string): Promise<void>;
}
