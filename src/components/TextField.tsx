import { useEffect, useState, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onCommit: (v: string) => void;
};

/** Text input that keeps its own state while focused and saves on blur, so the cursor never jumps. */
export function TextField({ value, onCommit, ...rest }: Props) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);
  return (
    <input
      {...rest}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => {
        setFocused(false);
        // Save what the field shows. A password manager or autofill can change the field
        // without a change event, and then `text` is not what the user sees.
        const shown = e.currentTarget.value;
        setText(shown);
        if (shown !== value) onCommit(shown);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}
