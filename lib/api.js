import PropTypes from "prop-types"
import addFragments from "./fragments"

const space = process.env.CONTENTFUL_SPACE_ID
const accessToken = process.env.CONTENTFUL_ACCESS_TOKEN
const previewAccessToken = process.env.CONTENTFUL_PREVIEW_ACCESS_TOKEN

const twoDaysBeforeNow = new Date()
twoDaysBeforeNow.setHours(twoDaysBeforeNow.getHours() - 48)

async function graphQL(q, preview) {
  return fetch(`https://graphql.contentful.com/content/v1/spaces/${space}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${
        preview
          ? previewAccessToken
          : accessToken
      }`,
    },
    body: JSON.stringify({
      query: addFragments(q),
    })
  })
}

export async function getRecentEvents(preview) {
  const res = await graphQL(
    `{
      eventCollection(
        order: [startDate_ASC]
        where: {
          endDate_gte: "${twoDaysBeforeNow.toISOString()}"
        }
        limit: 5
      ) {
        items {
          ...EventListingFields
        }
      }
    }
    `, preview
  );
  // grab the items from our response
  const { data } = await res.json()

  if (data?.eventCollection?.items?.length) return data.eventCollection.items

  return []
}

export async function getEventBySlug(slug, preview) {
  const res = await graphQL(
    `{
      eventCollection(where: { slug: "${slug}" }, preview: ${preview ? "true" : "false"}, limit: 1) {
        items {
          ...EventFields
        }
      }
    }
    `, preview
  );
  // grab the items from our response
  const { data } = await res.json()

  if (data?.eventCollection?.items?.length) return data.eventCollection.items[0]

  return null
}

export async function getAllEvents(preview) {
  const res = await graphQL(
    `{
      eventCollection(
        limit: 0
      ) {
        items {
          ...EventFields
        }
      }
    }
    `, preview
  );
  // grab the items from our response
  const { data } = await res.json()

  if (data?.eventCollection?.items?.length) return data.eventCollection.items

  return []
}

export async function getEventAndArchived(slug, preview) {
  const res = await graphQL(
    `{
      eventCollection(
        limit: 1
        preview: ${preview ? 'true' : 'false'}
        where: {
          slug: "${slug}"
        }
      ) {
        items {
          ...EventFields
        }
      }
    }
    `, preview
  );
  // grab the items from our response
  const { data } = await res.json()

  const res2 = data?.eventCollection?.items?.length && data.eventCollection.items[0].market?.continent ? await graphQL(
    `{
      eventCollection(
        limit: 4
        order: [startDate_ASC]
        where: {
          slug_not: "${data.eventCollection.items[0].slug}"
          market: { continent_contains_some: "${data.eventCollection.items[0].market?.continent ?? "North America"}" }
        }
      ) {
        items {
          ...EventListingFields
        }
      }
    }
    `, preview
  ) : null;
  // grab the items from our response
  const { data: data2 } = res2 ? await res2.json() : { data: null }

  const res3 = data?.eventCollection?.items?.length && data.eventCollection.items[0].eventName?.name ? await graphQL(
    `{
      eventCollection(
        limit: 20
        order: [startDate_ASC]
        where: {
          slug_not: "${data.eventCollection.items[0].slug}"
          eventName: { name: "${data.eventCollection.items[0].eventName.name}" }
        }
      ) {
        items {
          ...EventListingFields
        }
      }
    }
    `, preview
  ) : null;
  // grab the items from our response
  const { data: data3 } = res3 ? await res3.json() : { data: null }

  if (data?.eventCollection?.items?.length) return {
    event: data?.eventCollection?.items?.length ? data.eventCollection.items[0] : null,
    related: data2?.eventCollection?.items?.length ? data2.eventCollection.items : [],
    others: data3?.eventCollection?.items?.length ? data3.eventCollection.items : []
  }

  return []
}

export async function getFilteredEvents({brand=[], category=[], market=[], sponsorship=[], startDate=[twoDaysBeforeNow.toISOString()], endDate=[], p=1, preview=false}) {

  const skipInt = 20

  const restrictiveFilters = [
    ...startDate.map(sd => {
      return `{ startDate_gte: "${sd}" }`
    }),
    ...endDate.map(ed => {
      return `{ endDate_lte: "${ed}" }`
    }),

    ...(brand.length > 0 ? ["{OR: [" + brand.map(b => {
      return `{ brand: { key: "${b}" } }`
    }).join(", \n") + "]}"] : []),

    ...(category.length > 0 ? ["{OR: [" + category.map(c => {
      return `
        { categoryOne: { key: "${c}" } },
        { categoryTwo: { key: "${c}" } },
        { categoryThree: { key: "${c}" } },
        { categoryFour: { key: "${c}" } },
        { categoryFive: { key: "${c}" } }
      `
    }).join(", \n") + "]}"] : []),

    ...(sponsorship.length > 0 ? ["{OR: [" + sponsorship.map(s => {
      return `
        { sponsorshipTypeOne: { key: "${s}" } },
        { sponsorshipTypeTwo: { key: "${s}" } },
        { sponsorshipTypeThree: { key: "${s}" } }
      `
    }).join(", \n") + "]}"] : []),

    ...(market.length > 0 ? [`{ market: { country_contains_some: [
      ${market.map(loc => `"${loc}"`).join(", \n")}
    ] } }`] : []),
  ]

  const andFilter = restrictiveFilters.length ?
    `
    AND: [
      ${restrictiveFilters.join(", \n")}
    ]
    `
  : ""

  const skip = (p * skipInt) - skipInt

  const res = await graphQL(
    `{
      eventCollection(
        skip: ${skip}
        limit: ${skipInt + 1}
        order: [startDate_ASC]
        where: {
          hideFromSearch_not: true
          ${andFilter}
        }
      ) {
        items {
          ...EventListingFields
        }
      }
    }`, preview
  );
  // grab the items from our response
  const { data } = await res.json()

  if (data?.eventCollection?.items?.length) {
    // Pagination helpers.
    if (data.eventCollection.items.length < 21) {
      // Set last item && return all items
      data.eventCollection.items[data.eventCollection.items.length - 1].lastItem = true
      return data.eventCollection.items
    }
    else {
      // Truncate so we have next page
      return data.eventCollection.items.slice(0, data.eventCollection.items.length - 1)
    }
  }

  return []
}

getFilteredEvents.propTypes = {
  brand: PropTypes.array,
  category: PropTypes.array,
  location: PropTypes.array,
  sponsorship: PropTypes.array,
  startDate: PropTypes.string,
  endDate: PropTypes.string,
  p: PropTypes.number,
  preview: PropTypes.bool,
  prevP: PropTypes.any,
};

export async function getAllBrands(preview) {

  const res = await graphQL(
    `{
      brandCollection(limit: 0) {
        items {
          sys {
            id
          }
          title
          key
        }
      }
    }`, preview
  );
  // grab the items from our response
  const { data } = await res.json()

  if (data?.brandCollection?.items?.length) return data.brandCollection.items

  return []
}

export async function getAllCategories(preview) {

  const res = await graphQL(
    `{
      categoryCollection(limit: 0) {
        items {
          sys {
            id
          }
          title
          key
        }
      }
    }`, preview
  );
  // grab the items from our response
  const { data } = await res.json()

  if (data?.categoryCollection?.items?.length) return data.categoryCollection.items

  return []
}

export async function getAllMarkets(preview) {

  const res = await graphQL(
    `{
      marketCollection(limit: 0) {
        items {
          sys {
            id
          }
          title
          key
          continent
          country
          state
          city
        }
      }
    }`, preview
  );
  // grab the items from our response
  const { data } = await res.json()

  if (data?.marketCollection?.items?.length) return data.marketCollection.items

  return []
}

export async function getAllSponsorships(preview) {

  const res = await graphQL(
    `{
      sponsorshipCollection(limit: 0) {
        items {
          sys {
            id
          }
          title
          key
        }
      }
    }`, preview
  );
  // grab the items from our response
  const { data } = await res.json()

  if (data?.sponsorshipCollection?.items?.length) return data.sponsorshipCollection.items

  return []
}

export async function getAllLinkBlocks(preview) {
  const res = await graphQL(
    `{
      linkBlockCollection(limit: 0) {
        items {
          sys {
            id
          }
          title
          key
          link
        }
      }
    }`, preview
  );
  // grab the items from our response
  const { data } = await res.json()

  if (data?.linkBlockCollection?.items?.length) return data.linkBlockCollection.items

  return []

}

export async function getHomePageContent(preview) {
  const res = await graphQL(
    `{
      landingPageCollection(
        limit: 1
        where: {
          slug: "home"
        }
      ) {
        items {
          ...LandingPageFields
        }
      }
    }`, preview
  );
  // grab the items from our response
  const { data } = await res.json()

  if (data?.landingPageCollection?.items?.length) return data.landingPageCollection.items[0]

  return null

}

export async function getSponsorshipPageContent(preview) {
  const res = await graphQL(
    `{
      landingPageCollection(
        limit: 1
        where: {
          slug: "sponsorships"
        }
      ) {
        items {
          ...LandingPageFields
        }
      }
    }`, preview
  );
  // grab the items from our response
  const { data } = await res.json()

  if (data?.landingPageCollection?.items?.length) return data.landingPageCollection.items[0]

  return null

}

export async function getAllFilterOptions(preview) {
  const res = await graphQL(
    `{
      brandCollection(limit: 0) {
        items {
          title
          key
        }
      }
      categoryCollection(limit: 0) {
        items {
          title
          key
        }
      }
      marketCollection(limit: 0) {
        items {
          country
        }
      }
      sponsorshipCollection(limit: 0) {
        items {
          title
          key
        }
      }
    }`, preview
  );
  // grab the items from our response
  const { data } = await res.json()

  if (data) {
    // Massage market data so only uniques are returned and sort by alpha.
    if (data.marketCollection?.items?.length > 1) {
      data.marketCollection.items = data.marketCollection.items.reduce((ac, item) => {
        // Must have country.
        if (!item.country) return ac
        if (!ac.includes(item.country[0])) ac.push(item.country[0])
        return ac
      }, []).sort()
    }
    // Order brands by alpha.
    if (data.brandCollection?.items?.length > 1) {
      data.brandCollection.items = data.brandCollection.items.sort((a, b) => (a.title > b.title) ? 1 : -1)
    }
    return data
  }

  return []

}
