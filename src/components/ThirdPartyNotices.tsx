import { uiText } from "../i18n/index.ts";
import { useState, type ReactNode } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import react from '../assets/brands/react.svg?raw';
import tailwind from '../assets/brands/tailwindcss.svg?raw';
import bilibili from '../assets/brands/bilibili.svg?raw';
import tauri from '../assets/brands/tauri.svg?raw';
import radix from '../assets/brands/radixui.svg?raw';
import afdian from '../assets/brands/afdian.svg?raw';
import blivechat from '../assets/brands/blivechat.ico';
import laplace from '../assets/brands/laplace-chat.svg';

function BrandIcon({ source }: { source: string }) {
  return <span className="about-brand-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: source }} />;
}

export function AboutLinks() {
  const [error, setError] = useState('');
  function link(name: string, href: string, icon: ReactNode, brand: string) {
    return <a className={`about-badge about-badge-${brand}`} href={href} title={uiText("thirdPartyNotices.title", { name: name })} onClick={event => {
      event.preventDefault();
      setError('');
      void openUrl(href).catch(() => setError(uiText("thirdPartyNotices.onClick")));
    }}>{icon && <span className="about-badge-logo">{icon}</span>}<span className="about-badge-name">{name}</span></a>;
  }
  return <div className="about-links">
    <div className="about-compatible"><span className="about-group-label">{uiText("thirdPartyNotices.AboutLinks")}</span><div className="about-link-row">
      {link('Blivechat', 'https://github.com/xfgryujk/blivechat', <img className="about-brand-icon" src={blivechat} alt="" />, 'blivechat')}
      {link('LAPLACE Chat', 'https://chat.laplace.live/', <img className="about-brand-icon" src={laplace} alt="" />, 'laplace')}
    </div></div>
    <nav className="about-link-row about-technologies" aria-label={uiText("thirdPartyNotices.aria_label")}>
      {link('React', 'https://react.dev/', <BrandIcon source={react} />, 'react')}
      {link('Tauri', 'https://tauri.app/', <BrandIcon source={tauri} />, 'tauri')}
      {link('Tailwind CSS', 'https://tailwindcss.com/', <BrandIcon source={tailwind} />, 'tailwind')}
      {link('Radix UI', 'https://www.radix-ui.com/', <BrandIcon source={radix} />, 'radix')}
    </nav>
    <nav className="about-link-row about-profiles" aria-label={uiText("thirdPartyNotices.aria_label2")}>
      {link(uiText("thirdPartyNotices.AboutLinks2"), 'https://space.bilibili.com/4261481', <BrandIcon source={bilibili} />, 'bilibili')}
      {link(uiText("thirdPartyNotices.AboutLinks3"), 'https://afdian.com/a/orangeee', <BrandIcon source={afdian} />, 'afdian')}
    </nav>
    {error && <p className="about-link-error" role="status">{error}</p>}
  </div>;
}
