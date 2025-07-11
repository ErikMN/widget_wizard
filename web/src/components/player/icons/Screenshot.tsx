import React from 'react';
import { controlButtonStyle } from './button-style';

export const Screenshot = ({
  title,
  ...buttonProps
}: React.DOMAttributes<HTMLButtonElement> & { readonly title?: string }) => {
  return (
    <button {...buttonProps} style={controlButtonStyle}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
      >
        {title !== undefined ? <title>{title}</title> : null}
        <path d="M0 0h24v24H0z" fill="none" />
        <circle cx="12" cy="12" r="3.2" />
        <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
      </svg>
    </button>
  );
};
