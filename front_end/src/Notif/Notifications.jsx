import React from "react";
import {
  CheckCircle,
  AlertCircle,
  FileText,
} from "lucide-react";

const Notifications = ({ notifications }) => {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`flex items-center gap-3 px-6 py-4 rounded-lg border shadow-lg transform transition-all duration-300 animate-in slide-in-from-right ${
            notification.type === "success"
              ? "bg-success-lighter border-success-light text-success-color"
              : notification.type === "error"
              ? "bg-error-lighter border-error-light text-error-color"
              : "bg-primary-lighter border-primary-light text-primary-color"
          }`}
        >
          {notification.type === "success" && (
            <CheckCircle className="w-5 h-5" />
          )}
          {notification.type === "error" && (
            <AlertCircle className="w-5 h-5" />
          )}
          {notification.type === "info" && <FileText className="w-5 h-5" />}
          <span className="font-medium">{notification.message}</span>
        </div>
      ))}
    </div>
  );
};

export default Notifications; 