import { within } from "@testing-library/react";

/**
 * textContent 가 정확히 `text` 인 요소를 찾는다.
 *
 * 값이 여러 노드로 쪼개지면(MetricCard 의 "6.9" + "억") 기본 getByText 는
 * 노드별 텍스트만 보므로 정확 문자열 조회가 실패한다. 여기서는 textContent
 * 로 비교하되, 같은 문자열을 담은 자식이 있으면 자식 쪽을 고른다 — 부모와
 * 자식이 함께 매치돼 "multiple elements" 로 터지지 않게 한다.
 */
function isTextContentMatch(el: Element, text: string): boolean {
  if (el.textContent !== text) return false;
  return !Array.from(el.children).some((child) => child.textContent === text);
}

const matcher = (text: string) => (_: string, el: Element | null) =>
  el ? isTextContentMatch(el, text) : false;

export function getByTextContent(container: HTMLElement, text: string): HTMLElement {
  return within(container).getByText(matcher(text));
}

export function findByTextContent(container: HTMLElement, text: string): Promise<HTMLElement> {
  return within(container).findByText(matcher(text));
}

export function findAllByTextContent(container: HTMLElement, text: string): Promise<HTMLElement[]> {
  return within(container).findAllByText(matcher(text));
}

export function queryByTextContent(container: HTMLElement, text: string): HTMLElement | null {
  return within(container).queryByText(matcher(text));
}

export function queryAllByTextContent(container: HTMLElement, text: string): HTMLElement[] {
  return within(container).queryAllByText(matcher(text));
}
