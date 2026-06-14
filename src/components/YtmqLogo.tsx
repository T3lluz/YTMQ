type YtmqLogoProps = {
  className?: string
}

export function YtmqLogo({ className }: YtmqLogoProps) {
  const src = `${import.meta.env.BASE_URL}favicon.svg`

  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className={className}
      width={64}
      height={64}
      decoding="async"
    />
  )
}
