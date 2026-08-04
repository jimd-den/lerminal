import type * as NotificationsModule from "expo-notifications";
import {
  AppNotification,
  NotificationGateway,
} from "../../usecases/ports/gateways/NotificationGateway";
import { Logger, silentLogger } from "../../usecases/ports/Logger";

/**
 * # Expo Notification Gateway
 *
 * ## Business Value & Purpose
 * Delivers the "your generation is done" message through the OS, so a model call the user
 * walked away from still reaches them.
 *
 * These are **local** notifications only — scheduled by the app, on the device, with no
 * server and no push token. That is all this feature needs.
 *
 * ## Why the module is loaded lazily
 * `expo-notifications` is a native module, and in Expo Go there is nothing behind it.
 * Importing it at module scope made that a *load-time* failure of everything that
 * transitively imports the composition root — the app would not render at all. Requiring it
 * on first use keeps the blast radius inside a method that is already contractually silent,
 * and lets the composition root pick {@link SilentNotificationGateway} for Expo Go without
 * the mere presence of this file mattering.
 *
 * ## Failure is always silent
 * Every method swallows its errors. A notification is a courtesy attached to work that has
 * *already succeeded*; letting a permissions quirk or an OS refusal bubble up would turn a
 * completed generation into a visible failure, which would be a lie about what happened.
 * Refusals are logged, never raised.
 */
export class ExpoNotificationGateway implements NotificationGateway {
  /** Cached so a denied prompt is not re-asked on every completed job. */
  private granted: boolean | null = null;
  /** Resolved on first use; `null` once we know the module cannot be loaded here. */
  private module: typeof NotificationsModule | null | undefined;

  constructor(private readonly logger: Logger = silentLogger) {}

  /**
   * Loads the native module and installs the foreground handler exactly once: a banner
   * even while the app is open, because the caller has already decided this job was worth
   * interrupting for. Returns `null` when the host has no notification support.
   */
  private load(): typeof NotificationsModule | null {
    if (this.module !== undefined) return this.module;
    try {
      const loaded = require("expo-notifications") as typeof NotificationsModule;
      loaded.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      this.module = loaded;
    } catch (error) {
      this.logger.warn("notifications.unavailable", { error: String(error) });
      this.module = null;
    }
    return this.module;
  }

  async requestPermission(): Promise<boolean> {
    if (this.granted !== null) return this.granted;
    const Notifications = this.load();
    if (!Notifications) {
      this.granted = false;
      return false;
    }
    try {
      const existing = await Notifications.getPermissionsAsync();
      if (existing.granted) {
        this.granted = true;
        return true;
      }
      // `canAskAgain: false` means the user has permanently refused; asking again would
      // be a no-op that still costs a round trip.
      if (!existing.canAskAgain) {
        this.granted = false;
        return false;
      }
      const requested = await Notifications.requestPermissionsAsync();
      this.granted = requested.granted;
      return requested.granted;
    } catch (error) {
      this.logger.warn("notifications.permission_failed", { error: String(error) });
      this.granted = false;
      return false;
    }
  }

  async notify(notification: AppNotification): Promise<void> {
    try {
      if (!(await this.requestPermission())) return;
      const Notifications = this.load();
      if (!Notifications) return;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          ...(notification.threadId ? { threadIdentifier: notification.threadId } : {}),
        },
        // Immediately. There is nothing to schedule — the work is done now.
        trigger: null,
      });
    } catch (error) {
      // See the class note: never let this surface as a failure of the run itself.
      this.logger.warn("notifications.notify_failed", { error: String(error) });
    }
  }
}
