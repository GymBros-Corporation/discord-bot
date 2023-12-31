import { getWeeklyReport } from "@/app/utils/weeklyreport"
import { commands, RandomPicType } from "@/commands"
import { verifyInteractionRequest } from "@/discord/verify-incoming-request"
import {
  APIInteractionDataOptionBase,
  ApplicationCommandOptionType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
} from "discord-api-types/v10"
import { NextResponse } from "next/server"
import { supabase } from "../../../supabaseClient"
import { getRandomPic } from "./random-pic"

/**
 * Use edge runtime which is faster, cheaper, and has no cold-boot.
 * If you want to use node runtime, you can change this to `node`, but you'll also have to polyfill fetch (and maybe other things).
 *
 * @see https://nextjs.org/docs/app/building-your-application/rendering/edge-and-nodejs-runtimes
 */
export const runtime = "edge"

// Your public key can be found on your application in the Developer Portal
const DISCORD_APP_PUBLIC_KEY = process.env.DISCORD_APP_PUBLIC_KEY
const ROOT_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : process.env.ROOT_URL || "http://localhost:3000"

function capitalizeFirstLetter(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Handle Discord interactions. Discord will send interactions to this endpoint.
 *
 * @see https://discord.com/developers/docs/interactions/receiving-and-responding#receiving-an-interaction
 */
export async function POST(request: Request) {
  const verifyResult = await verifyInteractionRequest(request, DISCORD_APP_PUBLIC_KEY!)
  if (!verifyResult.isValid || !verifyResult.interaction) {
    return new NextResponse("Invalid request", { status: 401 })
  }
  const { interaction } = verifyResult

  if (interaction.type === InteractionType.Ping) {
    // The `PING` message is used during the initial webhook handshake, and is
    // required to configure the webhook in the developer portal.
    return NextResponse.json({ type: InteractionResponseType.Pong })
  }

  const { data, error } = await supabase.from("User").select("*")

  if (!data) {
    throw new Error("Error in query")
  }

  const randomUser = data[Math.floor(Math.random() * data.length)]

  if (interaction.type === InteractionType.ApplicationCommand) {
    const { name } = interaction.data

    switch (name) {
      case commands.ping.name:
        return NextResponse.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { content: `Random user username: ${randomUser.username}` },
        })

      case commands.invite.name:
        return NextResponse.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            content: `Click this link to add NextBot to your server: https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_APP_ID}&permissions=2147485696&scope=bot%20applications.commands`,
            flags: MessageFlags.Ephemeral,
          },
        })

      case commands.pokemon.name:
        if (!interaction.data.options || interaction.data.options?.length < 1) {
          return NextResponse.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              content: "Oops! Please enter a Pokemon name or Pokedex number.",
              flags: MessageFlags.Ephemeral,
            },
          })
        }

        const option = interaction.data.options[0]
        // @ts-ignore
        const idOrName = String(option.value).toLowerCase()

        try {
          const pokemon = await fetch(`https://pokeapi.co/api/v2/pokemon/${idOrName}`).then((res) => {
            return res.json()
          })
          const types = pokemon.types.reduce(
            (prev: string[], curr: { type: { name: string } }) => [...prev, capitalizeFirstLetter(curr.type.name)],
            []
          )

          const r = {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              embeds: [
                {
                  title: capitalizeFirstLetter(pokemon.name),
                  image: {
                    url: `${ROOT_URL}/api/pokemon/${idOrName}`,
                  },
                  fields: [
                    {
                      name: "Pokedex",
                      value: `#${String(pokemon.id).padStart(3, "0")}`,
                    },
                    {
                      name: "Type",
                      value: types.join("/"),
                    },
                  ],
                },
              ],
            },
          }
          return NextResponse.json({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
              embeds: [
                {
                  title: capitalizeFirstLetter(pokemon.name),
                  image: {
                    url: `${ROOT_URL}/api/pokemon/${idOrName}`,
                  },
                  fields: [
                    {
                      name: "Pokedex",
                      value: `#${String(pokemon.id).padStart(3, "0")}`,
                    },
                    {
                      name: "Type",
                      value: types.join("/"),
                    },
                  ],
                },
              ],
            },
          })
        } catch (error) {
          throw new Error("Something went wrong :(")
        }

      case commands.randompic.name:
        const { options } = interaction.data
        if (!options) {
          return new NextResponse("Invalid request", { status: 400 })
        }

        const { value } = options[0] as APIInteractionDataOptionBase<ApplicationCommandOptionType.String, RandomPicType>
        const embed = await getRandomPic(value)
        return NextResponse.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { embeds: [embed] },
        })

      case commands.weeklyreport.name:
        await fetch("https://discord-server-muddy-mountain-5164.fly.dev/weeklyreport", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        })
        const responseContent = "Generating metrics, please wait..."
        // const responseContent = await getWeeklyReport()

        return NextResponse.json({
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { content: responseContent },
        })

      default:
      // Pass through, return error at end of function
    }
  }

  return new NextResponse("Unknown command", { status: 400 })
}
