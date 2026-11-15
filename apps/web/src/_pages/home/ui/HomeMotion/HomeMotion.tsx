'use client';

import { useEffect, useRef } from 'react';

import styles from './styles.module.scss';

import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export const HomeMotion = (props: Props) => {
  const { children } = props;
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const main = mainRef.current;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (!main || !('IntersectionObserver' in window) || motion.matches) return;

    // The promo already animates on load; never hide its LCP image behind an observer.
    const sections: Element[] = [];
    const registered = new WeakSet<Element>();

    const reveal = (element: Element) => {
      element.classList.remove(styles.pending);
      element.classList.add(styles.entered);
    };

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        reveal(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });

    const registerSections = () => {
      Array.from(main.children).forEach(section => {
        const isSection = section.matches('section, aside');
        const isPromo = section.getAttribute('aria-labelledby') === 'promo-heading';

        if (!isSection || isPromo || registered.has(section)) return;

        registered.add(section);
        sections.push(section);
        const bounds = section.getBoundingClientRect();
        const alreadyVisible = bounds.top < window.innerHeight && bounds.bottom > 0;

        if (alreadyVisible) {
          reveal(section);
          return;
        }

        section.classList.add(styles.pending);
        observer.observe(section);
      });
    };

    const mutations = new MutationObserver(registerSections);
    mutations.observe(main, { childList: true });
    registerSections();

    const onFocus = (event: FocusEvent) => {
      const section = sections.find(element => event.target instanceof Node && element.contains(event.target));

      if (!section) return;

      reveal(section);
      observer.unobserve(section);
    };

    main.addEventListener('focusin', onFocus);

    return () => {
      observer.disconnect();
      mutations.disconnect();
      main.removeEventListener('focusin', onFocus);
      sections.forEach(section => {
        section.classList.remove(styles.pending, styles.entered);
      });
    };
  }, []);

  return <main ref={mainRef}>{children}</main>;
};
