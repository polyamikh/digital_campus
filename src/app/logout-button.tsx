import { logoutAction } from "@/app/actions/auth";

export default function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button className="logout-button" type="submit">Выйти</button>
    </form>
  );
}
