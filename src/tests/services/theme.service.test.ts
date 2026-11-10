import { describe, it, expect, beforeEach, vi } from 'vitest';
import { themeService, AVAILABLE_SKINS } from '../../services/theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    themeService.setMode('light');
    themeService.setSkin('clinical-blue');
  });

  it('يجب أن يبدل بين الوضع النهاري والليلي ويحدث خصائص DOM', () => {
    expect(themeService.getMode()).toBe('light');

    const nextMode = themeService.toggleMode();
    expect(nextMode).toBe('dark');
    expect(themeService.getMode()).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    const backToLight = themeService.toggleMode();
    expect(backToLight).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('يجب أن يغير مظهر النظام (Skin) ويطبق متغيرات CSS', () => {
    const callback = vi.fn();
    themeService.onChange(callback);

    themeService.setSkin('emerald-care');
    expect(themeService.getSkin()).toBe('emerald-care');
    expect(themeService.getCurrentSkinDef().id).toBe('emerald-care');
    expect(document.documentElement.getAttribute('data-skin')).toBe('emerald-care');
    expect(document.documentElement.style.getPropertyValue('--skin-primary')).toBe('#059669');
    expect(callback).toHaveBeenCalled();
  });

  it('يجب أن يعرض شريط التحكم في الثيمات ويربط أحداث التفاعل', () => {
    expect(AVAILABLE_SKINS.length).toBeGreaterThanOrEqual(6);

    document.body.innerHTML = themeService.renderThemeToolbarCompact();
    themeService.bindToolbarEvents();

    const select = document.getElementById('global-skin-select') as HTMLSelectElement;
    const toggleBtn = document.getElementById('global-mode-toggle') as HTMLButtonElement;

    expect(select).not.toBeNull();
    expect(toggleBtn).not.toBeNull();

    select.value = 'royal-indigo';
    select.dispatchEvent(new Event('change'));
    expect(themeService.getSkin()).toBe('royal-indigo');

    toggleBtn.click();
    expect(themeService.getMode()).toBe('dark');
  });
});
