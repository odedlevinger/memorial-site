-- Schema for the dynamic-router Kong plugin.
-- Defines routing convention configuration.
return {
  name = "dynamic-router",
  fields = {
    {
      config = {
        type = "record",
        fields = {
          { default_port = { type = "integer", required = false, default = 3000 } },
        },
      },
    },
  },
}
