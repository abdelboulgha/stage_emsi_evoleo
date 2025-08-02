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
          className={`flex items-center gap-3 px-6 py-4 rounded-xl backdrop-blur-lg border shadow-lg transform transition-all duration-300 animate-in slide-in-from-right ${
            notification.type === "success"
              ? "bg-green-500/20 border-green-400/30 text-green-100"
              : notification.type === "error"
              ? "bg-red-500/20 border-red-400/30 text-red-100"
              : "bg-blue-500/20 border-blue-400/30 text-blue-100"
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