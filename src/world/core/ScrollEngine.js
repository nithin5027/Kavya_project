/**
 * SCROLL ENGINE — Single GSAP timeline controlling everything
 * ════════════════════════════════════════════════════════════
 * ONE master ScrollTrigger with scrub: true.
 * No scattered triggers. All state via mutable refs.
 */
import { useEffect, useRef, useCallback } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SCENE, SECTIONS } from '../config'

gsap.registerPlugin(ScrollTrigger)

/**
 * useScrollEngine — master scroll driver
 * Returns { progressRef, section, setSection, ready, setReady }
 */
export function useScrollEngine() {
  const progressRef = useRef(0)

  useEffect(() => {
    // Continuous scroll → ref + CSS custom property
    const onScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      const t = maxScroll > 0 ? window.scrollY / maxScroll : 0
      progressRef.current = t
      document.documentElement.style.setProperty('--scroll-progress', t)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return progressRef
}

/**
 * useSectionTriggers — fires setSection only on boundary crossings
 */
export function useSectionTriggers(setSection) {
  useEffect(() => {
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight

    const triggers = SECTIONS.map((sec) => {
      const startPx = sec.start * scrollHeight
      const endPx = sec.end * scrollHeight
      return ScrollTrigger.create({
        start: startPx,
        end: endPx,
        onEnter: () => setSection(sec.id),
        onEnterBack: () => setSection(sec.id),
      })
    })

    return () => {
      triggers.forEach(t => t.kill())
    }
  }, [setSection])
}
