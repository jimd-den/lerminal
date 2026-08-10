import { Contact, Station } from "../../entities/bridge";
import { BridgeRepository } from "../../usecases/ports/repositories/BridgeRepository";

/** In-memory bridge store for tests and zero-latency fallbacks. */
export class MemoryBridgeRepository implements BridgeRepository {
  private stations: Map<string, Station> = new Map();
  private contacts: Map<string, Contact> = new Map();

  async getStations(workspaceId: string): Promise<Station[]> {
    return Array.from(this.stations.values()).filter(
      (station) => station.workspaceId === workspaceId,
    );
  }

  async saveStation(station: Station): Promise<void> {
    this.stations.set(station.id, station);
  }

  async deleteStation(id: string): Promise<void> {
    this.stations.delete(id);
    // Mirrors the AsyncStorage implementation: a contact whose station is gone cannot be
    // expanded or explained, so it goes with the post that raised it.
    for (const [contactId, contact] of this.contacts) {
      if (contact.stationId === id) this.contacts.delete(contactId);
    }
  }

  async getContacts(workspaceId: string): Promise<Contact[]> {
    return Array.from(this.contacts.values()).filter(
      (contact) => contact.workspaceId === workspaceId,
    );
  }

  async saveContacts(contacts: Contact[]): Promise<void> {
    for (const contact of contacts) this.contacts.set(contact.id, contact);
  }

  async deleteContacts(ids: string[]): Promise<void> {
    for (const id of ids) this.contacts.delete(id);
  }
}
