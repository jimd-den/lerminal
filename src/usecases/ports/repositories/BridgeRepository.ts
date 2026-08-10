import { Contact, Station } from "../../../entities/bridge";

/**
 * # Bridge Repository Interface
 *
 * Persists the crew and the scope. Both are scoped by workspace, because a station stands
 * watch over *this* workspace's material and a contact is a reading about it — carrying
 * either across a workspace switch would put the wrong ship's instruments on the panel.
 *
 * Contacts are saved in bulk rather than one at a time: a single watch settles several at
 * once (raise three, escalate two), and writing them individually would let a crash land
 * the scope in a state no watch ever produced.
 */
export interface BridgeRepository {
  getStations(workspaceId: string): Promise<Station[]>;
  saveStation(station: Station): Promise<void>;
  deleteStation(id: string): Promise<void>;

  getContacts(workspaceId: string): Promise<Contact[]>;
  /** Inserts or replaces each contact by id, in one write. */
  saveContacts(contacts: Contact[]): Promise<void>;
  deleteContacts(ids: string[]): Promise<void>;
}
