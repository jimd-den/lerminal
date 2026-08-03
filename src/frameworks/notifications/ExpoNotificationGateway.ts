import * as Notifications from "expo-notifications";
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
 * server and no push token. That is both what this feature needs and the only kind that
 * works in Expo Go, which is where the app is developed.
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

  constructor(private readonly logger: Logger = silentLogger) {
    // Foreground behaviour is set once: a banner even while the app is open, because the
    // caller has already decided this job was worth interrupting for.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }

  async requestPermission(): Promise<boolean> {
    if (this.granted !== null) return this.granted;
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
