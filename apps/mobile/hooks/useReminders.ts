import * as Notifications from "expo-notifications";
import { useCallback } from "react";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Local daily learning reminder (no data leaves the device). */
export function useReminders() {
  const enable = useCallback(async (hour = 17) => {
    if (Platform.OS === "web") return false;
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return false;
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: { title: "Time to explore!", body: "A 15-minute activity keeps your streak going." },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute: 0 },
    });
    return true;
  }, []);
  const disable = useCallback(() => Notifications.cancelAllScheduledNotificationsAsync(), []);
  return { enable, disable };
}
