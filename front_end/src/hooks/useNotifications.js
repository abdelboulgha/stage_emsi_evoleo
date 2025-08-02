import { useCallback } from 'react';

export const useNotifications = (setNotifications) => {
  const showNotification = useCallback(
    (message, type = "success", duration = 5000) => {
      const id = Date.now();
      const notification = { id, message, type, duration };

      setNotifications((prev) => [...prev, notification]);

      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, duration);
    },
    [setNotifications]
  );

  return { showNotification };
}; 