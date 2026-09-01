import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function IconBase({ size = 24, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export function FlameIcon(props: IconProps) {
  return <IconBase {...props}><path d="M12.5 3.5c.7 3.4-2.2 4.3-2.2 7 0 1.2.8 2.1 1.9 2.1 1.5 0 2.5-1.3 2.2-3.3 2.2 1.8 3.4 4 3.4 6.3A5.8 5.8 0 0 1 12 21.2a5.8 5.8 0 0 1-5.8-5.6c0-3.2 2.1-6.2 6.3-12.1Z" /><path d="M9.7 16.1c0 1.6 1 2.7 2.3 2.7s2.3-1.1 2.3-2.7c0-1-.5-1.9-1.5-2.8.1 1.2-.4 2-1.2 2-.6 0-1-.5-.9-1.3-.7.7-1 1.4-1 2.1Z" /></IconBase>
}

export function StarIcon(props: IconProps) {
  return <IconBase {...props}><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" /></IconBase>
}

export function HeartIcon(props: IconProps) {
  return <IconBase {...props}><path d="M20.8 4.8a5.4 5.4 0 0 0-7.7 0L12 5.9l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7L12 21l8.8-8.5a5.4 5.4 0 0 0 0-7.7Z" /></IconBase>
}

export function CheckIcon(props: IconProps) {
  return <IconBase {...props}><path d="m5 12.5 4.2 4.2L19 7" /></IconBase>
}

export function PinIcon(props: IconProps) {
  return <IconBase {...props}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></IconBase>
}

export function SparkIcon(props: IconProps) {
  return <IconBase {...props}><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z" /><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /></IconBase>
}
