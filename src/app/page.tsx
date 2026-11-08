import StudentHomeContent from "./student-home-content";

const navigation = [
  { label: "Главная", icon: "⌂", active: true },
  { label: "Мой профиль", icon: "◉" },
  { label: "Расписание", icon: "▦" },
  { label: "Успеваемость", icon: "▥" },
  { label: "Заявки и справки", icon: "▤" },
  { label: "Уведомления", icon: "♧" },
  { label: "Календарь задач", icon: "▣" },
  { label: "Тестирование", icon: "✓" },
  { label: "Материалы", icon: "▱" },
  { label: "Домашнее задание", icon: "▧" },
  { label: "Чаты", icon: "▰" },
  { label: "Нет пропуска?", icon: "▣" },
  { label: "Карьерные возможности", icon: "↗" },
  { label: "AI-помощник", icon: "✳" },
];

function Icon({ children }: { children: string }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

export default function Home() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Перейти к содержимому</a>

      <aside className="sidebar" aria-label="Студенческая навигация">
        <a className="brand" href="#main-content" aria-label="Digital Campus — главная">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span className="brand-name">DIGITAL<br />CAMPUS<small>МГИМО</small></span>
        </a>

        <div className="role-chip"><span className="role-dot" />Кабинет студента</div>
        <nav className="side-nav" aria-label="Разделы студента">
          <span className="nav-caption">УЧЁБА И КАМПУС</span>
          {navigation.map((item) => (
            item.active || item.label === "Мой профиль" ? (
              <a
                className={`nav-item${item.active ? " is-active" : ""}`}
                href={item.active ? "#main-content" : "#profile"}
                aria-current={item.active ? "page" : undefined}
                key={item.label}
              >
                <Icon>{item.icon}</Icon><span className="nav-label">{item.label}</span>
                {!item.active ? <span className="nav-status">В разработке</span> : null}
              </a>
            ) : (
              <div className="nav-item nav-disabled" aria-disabled="true" key={item.label}>
                <Icon>{item.icon}</Icon><span className="nav-label">{item.label}</span><span className="nav-status">В разработке</span>
              </div>
            )
          ))}
        </nav>
        <div className="sidebar-foot"><span className="status-light" />Демонстрационный интерфейс</div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs"><span>Студент</span><span className="crumb-separator">/</span><strong>Главная</strong></div>
          <div className="topbar-tools">
            <span className="demo-badge"><span />Демо-режим</span>
            <button className="icon-button notification-button" type="button" aria-label="Уведомления, демонстрационный просмотр">
              <Icon>♧</Icon><span className="notification-dot" />
            </button>
            <div className="profile-menu" id="profile" aria-label="Профиль Алисы Соколовой">
              <span className="avatar">АС</span><span className="profile-name">Алиса Соколова<small>ЦМ-26-1</small></span><span className="chevron">⌄</span>
            </div>
          </div>
        </header>

        <main className="main-content" id="main-content">
          <section className="hero" aria-labelledby="welcome-title">
            <h1 className="hero-title" id="welcome-title"><span>ПРИВЕТ,</span><span>АЛИСА!</span></h1>
            <span className="hero-divider" aria-hidden="true" />
            <p className="hero-copy">Твой учебный день,<br />задачи и возможности —<br />в одном пространстве</p>
          </section>

          <StudentHomeContent />
        </main>
      </div>
    </div>
  );
}
