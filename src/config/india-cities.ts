/**
 * Major Indian cities with lat/lng coordinates.
 * Used for plotting lead distribution on the India heatmap.
 *
 * Covers ~100 cities across all states — picks the biggest cities per state
 * plus tier-2/3 franchise-relevant cities.
 *
 * Coordinates are approximate city centers (WGS84).
 */

export interface CityCoord {
  name: string
  state: string
  lat: number
  lng: number
}

export const INDIA_CITIES: CityCoord[] = [
  // North — Punjab, Haryana, Delhi NCR, HP, J&K, Uttarakhand
  { name: 'Chandigarh', state: 'Chandigarh', lat: 30.7333, lng: 76.7794 },
  { name: 'Mohali', state: 'Punjab', lat: 30.7046, lng: 76.7179 },
  { name: 'Panchkula', state: 'Haryana', lat: 30.6942, lng: 76.8606 },
  { name: 'Ludhiana', state: 'Punjab', lat: 30.9010, lng: 75.8573 },
  { name: 'Amritsar', state: 'Punjab', lat: 31.6340, lng: 74.8723 },
  { name: 'Jalandhar', state: 'Punjab', lat: 31.3260, lng: 75.5762 },
  { name: 'Patiala', state: 'Punjab', lat: 30.3398, lng: 76.3869 },
  { name: 'Bathinda', state: 'Punjab', lat: 30.2110, lng: 74.9455 },
  { name: 'Delhi', state: 'Delhi', lat: 28.6139, lng: 77.2090 },
  { name: 'New Delhi', state: 'Delhi', lat: 28.6139, lng: 77.2090 },
  { name: 'Gurgaon', state: 'Haryana', lat: 28.4595, lng: 77.0266 },
  { name: 'Gurugram', state: 'Haryana', lat: 28.4595, lng: 77.0266 },
  { name: 'Noida', state: 'Uttar Pradesh', lat: 28.5355, lng: 77.3910 },
  { name: 'Greater Noida', state: 'Uttar Pradesh', lat: 28.4744, lng: 77.5040 },
  { name: 'Ghaziabad', state: 'Uttar Pradesh', lat: 28.6692, lng: 77.4538 },
  { name: 'Faridabad', state: 'Haryana', lat: 28.4089, lng: 77.3178 },
  { name: 'Ambala', state: 'Haryana', lat: 30.3782, lng: 76.7767 },
  { name: 'Karnal', state: 'Haryana', lat: 29.6857, lng: 76.9905 },
  { name: 'Panipat', state: 'Haryana', lat: 29.3909, lng: 76.9635 },
  { name: 'Rohtak', state: 'Haryana', lat: 28.8955, lng: 76.6066 },
  { name: 'Hisar', state: 'Haryana', lat: 29.1492, lng: 75.7217 },
  { name: 'Sonipat', state: 'Haryana', lat: 28.9931, lng: 77.0151 },
  { name: 'Shimla', state: 'Himachal Pradesh', lat: 31.1048, lng: 77.1734 },
  { name: 'Dharamshala', state: 'Himachal Pradesh', lat: 32.2190, lng: 76.3234 },
  { name: 'Kullu', state: 'Himachal Pradesh', lat: 31.9578, lng: 77.1095 },
  { name: 'Solan', state: 'Himachal Pradesh', lat: 30.9045, lng: 77.0967 },
  { name: 'Jammu', state: 'Jammu & Kashmir', lat: 32.7266, lng: 74.8570 },
  { name: 'Srinagar', state: 'Jammu & Kashmir', lat: 34.0837, lng: 74.7973 },
  { name: 'Dehradun', state: 'Uttarakhand', lat: 30.3165, lng: 78.0322 },
  { name: 'Haridwar', state: 'Uttarakhand', lat: 29.9457, lng: 78.1642 },
  { name: 'Rishikesh', state: 'Uttarakhand', lat: 30.0869, lng: 78.2676 },

  // UP, Bihar, Jharkhand
  { name: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lng: 80.9462 },
  { name: 'Kanpur', state: 'Uttar Pradesh', lat: 26.4499, lng: 80.3319 },
  { name: 'Agra', state: 'Uttar Pradesh', lat: 27.1767, lng: 78.0081 },
  { name: 'Varanasi', state: 'Uttar Pradesh', lat: 25.3176, lng: 82.9739 },
  { name: 'Meerut', state: 'Uttar Pradesh', lat: 28.9845, lng: 77.7064 },
  { name: 'Allahabad', state: 'Uttar Pradesh', lat: 25.4358, lng: 81.8463 },
  { name: 'Prayagraj', state: 'Uttar Pradesh', lat: 25.4358, lng: 81.8463 },
  { name: 'Bareilly', state: 'Uttar Pradesh', lat: 28.3670, lng: 79.4304 },
  { name: 'Aligarh', state: 'Uttar Pradesh', lat: 27.8974, lng: 78.0880 },
  { name: 'Moradabad', state: 'Uttar Pradesh', lat: 28.8386, lng: 78.7733 },
  { name: 'Saharanpur', state: 'Uttar Pradesh', lat: 29.9680, lng: 77.5552 },
  { name: 'Gorakhpur', state: 'Uttar Pradesh', lat: 26.7606, lng: 83.3732 },
  { name: 'Patna', state: 'Bihar', lat: 25.5941, lng: 85.1376 },
  { name: 'Gaya', state: 'Bihar', lat: 24.7914, lng: 85.0002 },
  { name: 'Muzaffarpur', state: 'Bihar', lat: 26.1225, lng: 85.3906 },
  { name: 'Bhagalpur', state: 'Bihar', lat: 25.2425, lng: 86.9842 },
  { name: 'Ranchi', state: 'Jharkhand', lat: 23.3441, lng: 85.3096 },
  { name: 'Jamshedpur', state: 'Jharkhand', lat: 22.8046, lng: 86.2029 },
  { name: 'Dhanbad', state: 'Jharkhand', lat: 23.7957, lng: 86.4304 },

  // Rajasthan, MP, Chhattisgarh
  { name: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873 },
  { name: 'Jodhpur', state: 'Rajasthan', lat: 26.2389, lng: 73.0243 },
  { name: 'Udaipur', state: 'Rajasthan', lat: 24.5854, lng: 73.7125 },
  { name: 'Kota', state: 'Rajasthan', lat: 25.2138, lng: 75.8648 },
  { name: 'Ajmer', state: 'Rajasthan', lat: 26.4499, lng: 74.6399 },
  { name: 'Bikaner', state: 'Rajasthan', lat: 28.0229, lng: 73.3119 },
  { name: 'Sikar', state: 'Rajasthan', lat: 27.6094, lng: 75.1399 },
  { name: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lng: 77.4126 },
  { name: 'Indore', state: 'Madhya Pradesh', lat: 22.7196, lng: 75.8577 },
  { name: 'Gwalior', state: 'Madhya Pradesh', lat: 26.2183, lng: 78.1828 },
  { name: 'Jabalpur', state: 'Madhya Pradesh', lat: 23.1815, lng: 79.9864 },
  { name: 'Ujjain', state: 'Madhya Pradesh', lat: 23.1793, lng: 75.7849 },
  { name: 'Raipur', state: 'Chhattisgarh', lat: 21.2514, lng: 81.6296 },
  { name: 'Bilaspur', state: 'Chhattisgarh', lat: 22.0797, lng: 82.1409 },

  // West — Gujarat, Maharashtra, Goa
  { name: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lng: 72.5714 },
  { name: 'Surat', state: 'Gujarat', lat: 21.1702, lng: 72.8311 },
  { name: 'Vadodara', state: 'Gujarat', lat: 22.3072, lng: 73.1812 },
  { name: 'Rajkot', state: 'Gujarat', lat: 22.3039, lng: 70.8022 },
  { name: 'Bhavnagar', state: 'Gujarat', lat: 21.7645, lng: 72.1519 },
  { name: 'Gandhinagar', state: 'Gujarat', lat: 23.2156, lng: 72.6369 },
  { name: 'Adipur', state: 'Gujarat', lat: 23.2634, lng: 70.1450 },
  { name: 'Mumbai', state: 'Maharashtra', lat: 19.0760, lng: 72.8777 },
  { name: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567 },
  { name: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lng: 79.0882 },
  { name: 'Nashik', state: 'Maharashtra', lat: 19.9975, lng: 73.7898 },
  { name: 'Thane', state: 'Maharashtra', lat: 19.2183, lng: 72.9781 },
  { name: 'Aurangabad', state: 'Maharashtra', lat: 19.8762, lng: 75.3433 },
  { name: 'Solapur', state: 'Maharashtra', lat: 17.6599, lng: 75.9064 },
  { name: 'Kolhapur', state: 'Maharashtra', lat: 16.7050, lng: 74.2433 },
  { name: 'Panaji', state: 'Goa', lat: 15.4909, lng: 73.8278 },
  { name: 'Margao', state: 'Goa', lat: 15.2832, lng: 73.9862 },

  // South — Karnataka, Kerala, Tamil Nadu, Andhra, Telangana
  { name: 'Bangalore', state: 'Karnataka', lat: 12.9716, lng: 77.5946 },
  { name: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946 },
  { name: 'Mysore', state: 'Karnataka', lat: 12.2958, lng: 76.6394 },
  { name: 'Mangalore', state: 'Karnataka', lat: 12.9141, lng: 74.8560 },
  { name: 'Hubli', state: 'Karnataka', lat: 15.3647, lng: 75.1240 },
  { name: 'Belgaum', state: 'Karnataka', lat: 15.8497, lng: 74.4977 },
  { name: 'Hyderabad', state: 'Telangana', lat: 17.3850, lng: 78.4867 },
  { name: 'Warangal', state: 'Telangana', lat: 17.9689, lng: 79.5941 },
  { name: 'Visakhapatnam', state: 'Andhra Pradesh', lat: 17.6868, lng: 83.2185 },
  { name: 'Vijayawada', state: 'Andhra Pradesh', lat: 16.5062, lng: 80.6480 },
  { name: 'Guntur', state: 'Andhra Pradesh', lat: 16.3067, lng: 80.4365 },
  { name: 'Tirupati', state: 'Andhra Pradesh', lat: 13.6288, lng: 79.4192 },
  { name: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707 },
  { name: 'Coimbatore', state: 'Tamil Nadu', lat: 11.0168, lng: 76.9558 },
  { name: 'Madurai', state: 'Tamil Nadu', lat: 9.9252, lng: 78.1198 },
  { name: 'Tiruchirappalli', state: 'Tamil Nadu', lat: 10.7905, lng: 78.7047 },
  { name: 'Salem', state: 'Tamil Nadu', lat: 11.6643, lng: 78.1460 },
  { name: 'Tirunelveli', state: 'Tamil Nadu', lat: 8.7139, lng: 77.7567 },
  { name: 'Kochi', state: 'Kerala', lat: 9.9312, lng: 76.2673 },
  { name: 'Thiruvananthapuram', state: 'Kerala', lat: 8.5241, lng: 76.9366 },
  { name: 'Kozhikode', state: 'Kerala', lat: 11.2588, lng: 75.7804 },
  { name: 'Thrissur', state: 'Kerala', lat: 10.5276, lng: 76.2144 },
  { name: 'Kannur', state: 'Kerala', lat: 11.8745, lng: 75.3704 },

  // East — West Bengal, Odisha, NE states
  { name: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639 },
  { name: 'Howrah', state: 'West Bengal', lat: 22.5958, lng: 88.2636 },
  { name: 'Durgapur', state: 'West Bengal', lat: 23.5204, lng: 87.3119 },
  { name: 'Asansol', state: 'West Bengal', lat: 23.6739, lng: 86.9524 },
  { name: 'Siliguri', state: 'West Bengal', lat: 26.7271, lng: 88.3953 },
  { name: 'Bhubaneswar', state: 'Odisha', lat: 20.2961, lng: 85.8245 },
  { name: 'Cuttack', state: 'Odisha', lat: 20.4625, lng: 85.8828 },
  { name: 'Guwahati', state: 'Assam', lat: 26.1445, lng: 91.7362 },
  { name: 'Dibrugarh', state: 'Assam', lat: 27.4728, lng: 94.9120 },
  { name: 'Imphal', state: 'Manipur', lat: 24.8170, lng: 93.9368 },
  { name: 'Agartala', state: 'Tripura', lat: 23.8315, lng: 91.2868 },
  { name: 'Shillong', state: 'Meghalaya', lat: 25.5788, lng: 91.8933 },
  { name: 'Itanagar', state: 'Arunachal Pradesh', lat: 27.0844, lng: 93.6053 },
  { name: 'Gangtok', state: 'Sikkim', lat: 27.3389, lng: 88.6065 },
  { name: 'Aizawl', state: 'Mizoram', lat: 23.1645, lng: 92.9376 },
  { name: 'Kohima', state: 'Nagaland', lat: 25.6751, lng: 94.1086 },
]

/**
 * Common aliases and misspellings that map to canonical city names.
 * Handles: shorthand, old names, regional spellings, area names within cities.
 */
const CITY_ALIASES: Record<string, string> = {
  // Delhi NCR variants
  'ncr': 'Delhi', 'new delhi': 'Delhi', 'south delhi': 'Delhi', 'north delhi': 'Delhi',
  'east delhi': 'Delhi', 'west delhi': 'Delhi', 'delhi ncr': 'Delhi', 'dwarka': 'Delhi',
  'rohini': 'Delhi', 'laxmi nagar': 'Delhi', 'karol bagh': 'Delhi',
  'navi mumbai': 'Mumbai', 'andheri': 'Mumbai', 'bandra': 'Mumbai', 'borivali': 'Mumbai',
  'thane west': 'Thane', 'kalyan': 'Thane', 'dombivli': 'Thane',
  // Bangalore variants
  'banglore': 'Bangalore', 'bengalore': 'Bangalore', 'blr': 'Bangalore',
  'whitefield': 'Bangalore', 'electronic city': 'Bangalore', 'koramangala': 'Bangalore',
  // Hyderabad variants
  'hyd': 'Hyderabad', 'secunderabad': 'Hyderabad', 'hydrabad': 'Hyderabad',
  'hitec city': 'Hyderabad', 'gachibowli': 'Hyderabad',
  // Chennai variants
  'madras': 'Chennai',
  // Kolkata variants
  'calcutta': 'Kolkata',
  // Pune variants
  'pimpri': 'Pune', 'chinchwad': 'Pune', 'pimpri-chinchwad': 'Pune', 'pcmc': 'Pune',
  'hinjewadi': 'Pune', 'wakad': 'Pune', 'kothrud': 'Pune',
  // Gurugram variants
  'gurgoan': 'Gurgaon', 'ggn': 'Gurgaon',
  // UP cities
  'prayag': 'Prayagraj', 'allahbad': 'Allahabad',
  // Haryana
  'kharar': 'Mohali', 'dhakoli': 'Panchkula', 'zirakpur': 'Chandigarh', 'derabassi': 'Mohali',
  // Punjab
  'ldh': 'Ludhiana', 'asr': 'Amritsar',
  // Rajasthan
  'jpr': 'Jaipur',
  // Gujarat
  'amd': 'Ahmedabad', 'baroda': 'Vadodara',
  // MP
  'mp bhopal': 'Bhopal',
  // South
  'vizag': 'Visakhapatnam', 'trichy': 'Tiruchirappalli', 'mysuru': 'Mysore',
  'mangaluru': 'Mangalore', 'belagavi': 'Belgaum', 'hubballi': 'Hubli',
  'calicut': 'Kozhikode', 'trivandrum': 'Thiruvananthapuram',
  'tvm': 'Thiruvananthapuram', 'ernakulam': 'Kochi', 'cochin': 'Kochi',
  // Bihar
  'muzaffarpur': 'Muzaffarpur', 'bhagalpur': 'Bhagalpur',
  // Northeast
  'dimapur': 'Kohima', 'silchar': 'Guwahati',
  // Others
  'pondicherry': 'Chennai', 'puducherry': 'Chennai',
  'nellore': 'Guntur', 'kakinada': 'Vijayawada',
}

/**
 * Fuzzy match a city name to known coordinates.
 * Tries: exact → alias → substring → word overlap.
 */
export function findCity(name: string): CityCoord | null {
  if (!name) return null
  const clean = name.trim().toLowerCase().replace(/[^a-z\s]/g, '').trim()
  if (!clean) return null

  // 1. Exact match
  const exact = INDIA_CITIES.find(c => c.name.toLowerCase() === clean)
  if (exact) return exact

  // 2. Alias lookup
  const aliasTarget = CITY_ALIASES[clean]
  if (aliasTarget) {
    const aliased = INDIA_CITIES.find(c => c.name === aliasTarget)
    if (aliased) return aliased
  }

  // 3. Alias partial (check if input contains an alias key)
  for (const [alias, target] of Object.entries(CITY_ALIASES)) {
    if (clean.includes(alias) || alias.includes(clean)) {
      const found = INDIA_CITIES.find(c => c.name === target)
      if (found) return found
    }
  }

  // 4. Substring match (e.g., "Greater Noida" contains "Noida")
  const partial = INDIA_CITIES.find(c =>
    clean.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(clean)
  )
  if (partial) return partial

  // 5. Word overlap (e.g., "Pune Maharashtra" → matches "Pune")
  const words = clean.split(/\s+/)
  for (const word of words) {
    if (word.length < 3) continue
    const wordMatch = INDIA_CITIES.find(c => c.name.toLowerCase() === word)
    if (wordMatch) return wordMatch
  }

  return null
}

// ─── India map projection (equirectangular) ──────────────────────────────
// Bounds tuned for mainland India — keeps the country centered in the viewBox
// with minimal whitespace. Kashmir at top, Kanyakumari at bottom.
export const INDIA_BOUNDS = {
  minLat: 6,    // Kanyakumari (8.08°N) with padding
  maxLat: 37.5, // Kashmir (~37°N) with padding
  minLng: 67,   // West Gujarat (68.2°E) with padding
  maxLng: 98,   // Arunachal (~97.4°E) with padding
}

export function projectLatLng(
  lat: number,
  lng: number,
  width: number,
  height: number
): { x: number; y: number } {
  const { minLat, maxLat, minLng, maxLng } = INDIA_BOUNDS
  const x = ((lng - minLng) / (maxLng - minLng)) * width
  const y = ((maxLat - lat) / (maxLat - minLat)) * height
  return { x, y }
}
