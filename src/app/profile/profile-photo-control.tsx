"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MAX_PROFILE_PHOTO_BYTES } from "@/lib/profile/profile-photo-core";

export default function ProfilePhotoControl({
  displayName,
  photoVersion,
}: {
  displayName: string;
  photoVersion: number | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(file: File | undefined) {
    if (!file) return;
    setMessage("");
    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      setMessage("Размер фотографии не должен превышать 5 МБ.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const data = new FormData();
    data.set("photo", file);
    setBusy(true);
    try {
      const response = await fetch("/api/profile/photo", { method: "POST", body: data, credentials: "same-origin" });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Не удалось сохранить фотографию.");
        return;
      }
      setMessage("Фотография профиля обновлена.");
      router.refresh();
    } catch {
      setMessage("Не удалось сохранить фотографию. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removePhoto() {
    if (!source || busy) return;
    const confirmed = window.confirm("Удалить фотографию профиля? Вместо неё будет показан аватар с инициалами.");
    if (!confirmed) return;

    setMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/profile/photo", { method: "DELETE", credentials: "same-origin" });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Не удалось удалить фотографию.");
        return;
      }
      setMessage("Фотография удалена.");
      router.refresh();
    } catch {
      setMessage("Не удалось удалить фотографию. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  const initials = displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("ru-RU");
  const source = photoVersion === null ? null : `/api/profile/photo?v=${photoVersion}`;

  return (
    <div className="profile-photo-control">
      <span className="profile-large-avatar profile-photo-avatar" aria-hidden="true">
        {source ? <Image src={source} width={66} height={66} alt="" unoptimized /> : initials}
      </span>
      <div className="profile-photo-actions">
        <button className="profile-photo-button" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          <span aria-hidden="true">↥</span>{busy ? "Сохраняем…" : source ? "Изменить фото" : "Загрузить фото"}
        </button>
        {source && (
          <button className="profile-photo-button profile-photo-delete-button" type="button" disabled={busy} onClick={() => void removePhoto()}>
            <span aria-hidden="true">×</span>{busy ? "Удаляем…" : "Удалить фото"}
          </button>
        )}
        <input
          ref={inputRef}
          className="profile-photo-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          aria-label="Выберите фотографию JPG, PNG или WebP до 5 МБ"
          disabled={busy}
          onChange={(event) => void upload(event.currentTarget.files?.[0])}
        />
        <span className="profile-photo-hint">JPG, PNG или WebP · до 5 МБ</span>
        <p className="profile-photo-message" role={message.includes("не удалось") || message.includes("не должен") ? "alert" : "status"} aria-live="polite">
          {message}
        </p>
      </div>
    </div>
  );
}
