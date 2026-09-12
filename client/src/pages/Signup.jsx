import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AuthPage from "../AuthPage";

export default function Signup() {
  const navigate = useNavigate();

  const handleAuth = (user) => {
    localStorage.setItem("auth-user", JSON.stringify(user));
    navigate("/");
  };

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("auth-user"));
    if (user) navigate("/");
  }, [navigate]);

  return <AuthPage onAuth={handleAuth} />;
}