import { useNavigate } from "react-router-dom";
import { useTheme } from "../../context/ThemeContext";
import AuthScreen from "../../components/AuthScreen";

export default function Register() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <AuthScreen
      initialMode="signup"
      isDark={isDark}
      onToggleTheme={toggleTheme}
      onClose={() => navigate("/")}
      onSuccess={(email, name) => {
        navigate("/user/dashboard");
      }}
      onSwitchMode={(newMode) => {
        if (newMode === "signin") {
          navigate("/login");
        }
      }}
    />
  );
}
