import { Contact, Station } from "../../entities/bridge";
import { BridgeRepository } from "../../usecases/ports/repositories/BridgeRepository";
import { KeyValueStore } from "./KeyValueStore";
import { JsonCollectionStore, JsonStoreOptions, upsert, upsertAll } from "./JsonStore";

/**
 * Storage keys. New in this feature, so they carry the app's current name rather than the
 * legacy `learnimal_` prefix — that prefix is an on-disk contract for data that already
 * exists, not a convention worth extending.
 */
const STATIONS_KEY = "griot_bridge_stations_v1";
const CONTACTS_KEY = "griot_bridge_contacts_v1";

const stationId = (station: Station) => station.id;
const contactId = (contact: Contact) => contact.id;

/**
 * # AsyncStorage Bridge Repository
 *
 * ## Business Value & Purpose
 * Keeps the crew on watch and the scope populated between sessions. That persistence is
 * not a convenience: a station whose watch resets every launch would never accumulate the
 * `lastRunAt` that makes an interval mean anything, and a scope that empties on restart
 * would lose exactly the outstanding findings the captain has not dealt with yet.
 *
 * Both collections are stored whole and filtered by workspace on read. At the scale the
 * entity file caps them to — eight stations, a hundred-odd contacts — a per-workspace key
 * would buy nothing but a migration.
 */
export class AsyncStorageBridgeRepository implements BridgeRepository {
  private readonly stations: JsonCollectionStore<Station>;
  private readonly contacts: JsonCollectionStore<Contact>;

  constructor(store: KeyValueStore, options?: JsonStoreOptions) {
    this.stations = new JsonCollectionStore(STATIONS_KEY, store, "bridge stations", options);
    this.contacts = new JsonCollectionStore(CONTACTS_KEY, store, "bridge contacts", options);
  }

  async getStations(workspaceId: string): Promise<Station[]> {
    const all = await this.stations.readAll();
    return all.filter(station => station.workspaceId === workspaceId);
  }

  async saveStation(station: Station): Promise<void> {
    await this.stations.mutate(all => upsert(all, station, stationId));
  }

  async deleteStation(id: string): Promise<void> {
    await this.stations.mutate(all => all.filter(station => station.id !== id));
    // A station's contacts go with it: a reading attributed to a post that no longer
    // exists cannot be expanded, re-run, or explained, and leaving it on the scope would
    // be the display citing a source it cannot produce.
    await this.contacts.mutate(all => all.filter(contact => contact.stationId !== id));
  }

  async getContacts(workspaceId: string): Promise<Contact[]> {
    const all = await this.contacts.readAll();
    return all.filter(contact => contact.workspaceId === workspaceId);
  }

  async saveContacts(contacts: Contact[]): Promise<void> {
    if (contacts.length === 0) return;
    await this.contacts.mutate(all => upsertAll(all, contacts, contactId));
  }

  async deleteContacts(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const doomed = new Set(ids);
    await this.contacts.mutate(all => all.filter(contact => !doomed.has(contact.id)));
  }
}
