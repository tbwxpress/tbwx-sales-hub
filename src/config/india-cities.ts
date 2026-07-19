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

  // Maharashtra tier-2/3 additions
  { name: 'Chandrapur', state: 'Maharashtra', lat: 19.9550, lng: 79.2961 },
  { name: 'Latur', state: 'Maharashtra', lat: 18.4088, lng: 76.5604 },
  { name: 'Akola', state: 'Maharashtra', lat: 20.7059, lng: 77.0219 },
  { name: 'Sangli', state: 'Maharashtra', lat: 16.8524, lng: 74.5815 },
  { name: 'Yavatmal', state: 'Maharashtra', lat: 20.3897, lng: 78.1300 },
  { name: 'Wardha', state: 'Maharashtra', lat: 20.7453, lng: 78.6022 },
  { name: 'Ahmednagar', state: 'Maharashtra', lat: 19.0948, lng: 74.7480 },
  { name: 'Jalgaon', state: 'Maharashtra', lat: 21.0077, lng: 75.5626 },

  // Bihar additions
  { name: 'Darbhanga', state: 'Bihar', lat: 26.1542, lng: 85.8918 },
  { name: 'Purnia', state: 'Bihar', lat: 25.7771, lng: 87.4753 },
  { name: 'Begusarai', state: 'Bihar', lat: 25.4180, lng: 86.1300 },
  { name: 'Saharsa', state: 'Bihar', lat: 25.8800, lng: 86.5950 },

  // Jharkhand additions
  { name: 'Bokaro', state: 'Jharkhand', lat: 23.6693, lng: 86.1511 },
  { name: 'Hazaribagh', state: 'Jharkhand', lat: 23.9960, lng: 85.3617 },

  // Odisha additions
  { name: 'Rourkela', state: 'Odisha', lat: 22.2604, lng: 84.8536 },
  { name: 'Sambalpur', state: 'Odisha', lat: 21.4669, lng: 83.9756 },
  { name: 'Berhampur', state: 'Odisha', lat: 19.3149, lng: 84.7941 },

  // Rajasthan additions
  { name: 'Bharatpur', state: 'Rajasthan', lat: 27.2152, lng: 77.4977 },
  { name: 'Alwar', state: 'Rajasthan', lat: 27.5530, lng: 76.6346 },
  { name: 'Sri Ganganagar', state: 'Rajasthan', lat: 29.9038, lng: 73.8772 },

  // Madhya Pradesh additions
  { name: 'Sagar', state: 'Madhya Pradesh', lat: 23.8388, lng: 78.7378 },
  { name: 'Rewa', state: 'Madhya Pradesh', lat: 24.5373, lng: 81.3042 },
  { name: 'Satna', state: 'Madhya Pradesh', lat: 24.5667, lng: 80.8333 },
  { name: 'Dewas', state: 'Madhya Pradesh', lat: 22.9676, lng: 76.0534 },

  // Gujarat additions
  { name: 'Anand', state: 'Gujarat', lat: 22.5645, lng: 72.9289 },
  { name: 'Junagadh', state: 'Gujarat', lat: 21.5222, lng: 70.4579 },
  { name: 'Bhuj', state: 'Gujarat', lat: 23.2419, lng: 69.6669 },
  { name: 'Jamnagar', state: 'Gujarat', lat: 22.4707, lng: 70.0577 },

  // Tamil Nadu additions
  { name: 'Vellore', state: 'Tamil Nadu', lat: 12.9165, lng: 79.1325 },
  { name: 'Hosur', state: 'Tamil Nadu', lat: 12.7409, lng: 77.8253 },
  { name: 'Kanchipuram', state: 'Tamil Nadu', lat: 12.8342, lng: 79.7036 },

  // Karnataka additions
  { name: 'Tumkur', state: 'Karnataka', lat: 13.3389, lng: 77.1010 },
  { name: 'Davanagere', state: 'Karnataka', lat: 14.4663, lng: 75.9238 },
  { name: 'Shimoga', state: 'Karnataka', lat: 13.9299, lng: 75.5681 },

  // Andhra Pradesh additions
  { name: 'Kurnool', state: 'Andhra Pradesh', lat: 15.8281, lng: 78.0373 },
  { name: 'Anantapur', state: 'Andhra Pradesh', lat: 14.6819, lng: 77.6006 },
  { name: 'Kadapa', state: 'Andhra Pradesh', lat: 14.4673, lng: 78.8242 },
  { name: 'Eluru', state: 'Andhra Pradesh', lat: 16.7107, lng: 81.0950 },
  { name: 'Nellore', state: 'Andhra Pradesh', lat: 14.4426, lng: 79.9865 },

  // Telangana additions
  { name: 'Karimnagar', state: 'Telangana', lat: 18.4386, lng: 79.1288 },
  { name: 'Khammam', state: 'Telangana', lat: 17.2473, lng: 80.1514 },
  { name: 'Nizamabad', state: 'Telangana', lat: 18.6725, lng: 78.0941 },

  // Kerala additions
  { name: 'Kollam', state: 'Kerala', lat: 8.8932, lng: 76.6141 },
  { name: 'Alappuzha', state: 'Kerala', lat: 9.4981, lng: 76.3388 },

  // Puducherry
  { name: 'Puducherry', state: 'Puducherry', lat: 11.9416, lng: 79.8083 },

  // Uttar Pradesh additions
  { name: 'Mathura', state: 'Uttar Pradesh', lat: 27.4924, lng: 77.6737 },
  { name: 'Firozabad', state: 'Uttar Pradesh', lat: 27.1591, lng: 78.3957 },
  { name: 'Jhansi', state: 'Uttar Pradesh', lat: 25.4484, lng: 78.5685 },

  // Haryana additions
  { name: 'Yamunanagar', state: 'Haryana', lat: 30.1290, lng: 77.2674 },
  { name: 'Bahadurgarh', state: 'Haryana', lat: 28.6909, lng: 76.9319 },

  // Punjab additions
  { name: 'Pathankot', state: 'Punjab', lat: 32.2746, lng: 75.6521 },

  // Chhattisgarh additions
  { name: 'Bhilai', state: 'Chhattisgarh', lat: 21.2090, lng: 81.4285 },
  { name: 'Korba', state: 'Chhattisgarh', lat: 22.3595, lng: 82.7501 },

  // Third batch — late-2026 unmapped additions
  { name: 'Modasa', state: 'Gujarat', lat: 23.4644, lng: 73.2997 },
  { name: 'Kangra', state: 'Himachal Pradesh', lat: 32.0998, lng: 76.2691 },
  { name: 'Pinjore', state: 'Haryana', lat: 30.7942, lng: 76.9173 },
  { name: 'Hardoi', state: 'Uttar Pradesh', lat: 27.4167, lng: 80.1167 },
  { name: 'Jind', state: 'Haryana', lat: 29.3162, lng: 76.3144 },
  { name: 'Gulbarga', state: 'Karnataka', lat: 17.3297, lng: 76.8343 },
  { name: 'Balangir', state: 'Odisha', lat: 20.7099, lng: 83.4842 },
  { name: 'Manali', state: 'Himachal Pradesh', lat: 32.2432, lng: 77.1892 },
  { name: 'Mau', state: 'Uttar Pradesh', lat: 25.9412, lng: 83.5611 },
  { name: 'Palwal', state: 'Haryana', lat: 28.1473, lng: 77.3260 },
  { name: 'Khandwa', state: 'Madhya Pradesh', lat: 21.8333, lng: 76.3500 },
  { name: 'Anantnag', state: 'Jammu & Kashmir', lat: 33.7311, lng: 75.1487 },

  // Latest unmapped-cities batch (2026-05-30)
  { name: 'Amravati', state: 'Maharashtra', lat: 20.9333, lng: 77.7833 },
  { name: 'Panvel', state: 'Maharashtra', lat: 18.9894, lng: 73.1175 },
  { name: 'Ulhasnagar', state: 'Maharashtra', lat: 19.2215, lng: 73.1645 },
  { name: 'Malegaon', state: 'Maharashtra', lat: 20.5579, lng: 74.5287 },
  { name: 'Bhiwandi', state: 'Maharashtra', lat: 19.3002, lng: 73.0635 },
  { name: 'Gurdaspur', state: 'Punjab', lat: 32.0419, lng: 75.4053 },
  { name: 'Muzaffarnagar', state: 'Uttar Pradesh', lat: 29.4727, lng: 77.7085 },
  { name: 'Roorkee', state: 'Uttarakhand', lat: 29.8543, lng: 77.8880 },
  { name: 'Dharwad', state: 'Karnataka', lat: 15.4589, lng: 75.0078 },
  { name: 'Banswara', state: 'Rajasthan', lat: 23.5461, lng: 74.4350 },
  { name: 'Valsad', state: 'Gujarat', lat: 20.6101, lng: 72.9342 },
  { name: 'Gohana', state: 'Haryana', lat: 29.1373, lng: 76.6997 },

  // Fourth batch — Q2 2026 unmapped additions
  { name: 'Sambhal', state: 'Uttar Pradesh', lat: 28.5862, lng: 78.5734 },
  { name: 'Pinarayi', state: 'Kerala', lat: 11.8500, lng: 75.5667 },
  { name: 'Haflong', state: 'Assam', lat: 25.1675, lng: 93.0211 },
  { name: 'Ambajogai', state: 'Maharashtra', lat: 18.7236, lng: 76.3838 },
  { name: 'Amroha', state: 'Uttar Pradesh', lat: 28.9034, lng: 78.4685 },
  { name: 'Shamli', state: 'Uttar Pradesh', lat: 29.4495, lng: 77.3104 },
  { name: 'Mundra', state: 'Gujarat', lat: 22.8336, lng: 69.7218 },
  { name: 'Pilani', state: 'Rajasthan', lat: 28.3675, lng: 75.6043 },
  { name: 'Tumkunta', state: 'Telangana', lat: 17.5169, lng: 78.5489 },
  { name: 'Jhunjhunu', state: 'Rajasthan', lat: 28.1289, lng: 75.3995 },
  { name: 'Gandhidham', state: 'Gujarat', lat: 23.0758, lng: 70.1337 },

  // Fifth batch — drain pass 2026-05-30 (252-entry unmapped list)
  // Andhra Pradesh
  { name: 'Proddatur', state: 'Andhra Pradesh', lat: 14.7334, lng: 78.5489 },
  { name: 'Vizianagaram', state: 'Andhra Pradesh', lat: 18.1167, lng: 83.4000 },
  { name: 'Srikalahasti', state: 'Andhra Pradesh', lat: 13.7480, lng: 79.7000 },
  { name: 'Ongole', state: 'Andhra Pradesh', lat: 15.5057, lng: 80.0499 },
  { name: 'Chittoor', state: 'Andhra Pradesh', lat: 13.2172, lng: 79.1004 },
  // Jammu & Kashmir
  { name: 'Baramulla', state: 'Jammu & Kashmir', lat: 34.2099, lng: 74.3437 },
  { name: 'Kathua', state: 'Jammu & Kashmir', lat: 32.3700, lng: 75.5170 },
  { name: 'Pulwama', state: 'Jammu & Kashmir', lat: 33.8716, lng: 74.8989 },
  { name: 'Sopore', state: 'Jammu & Kashmir', lat: 34.2920, lng: 74.4660 },
  { name: 'Kulgam', state: 'Jammu & Kashmir', lat: 33.6447, lng: 75.0184 },
  // Daman and Diu
  { name: 'Diu', state: 'Daman and Diu', lat: 20.7144, lng: 70.9874 },
  // Maharashtra
  { name: 'Mahad', state: 'Maharashtra', lat: 18.0833, lng: 73.4167 },
  { name: 'Khamgaon', state: 'Maharashtra', lat: 20.7000, lng: 76.5667 },
  { name: 'Bhayander', state: 'Maharashtra', lat: 19.3007, lng: 72.8512 },
  { name: 'Mira Road', state: 'Maharashtra', lat: 19.2800, lng: 72.8541 },
  { name: 'Barsi', state: 'Maharashtra', lat: 18.2333, lng: 75.6833 },
  { name: 'Kandivali', state: 'Maharashtra', lat: 19.2030, lng: 72.8556 },
  { name: 'Lonavala', state: 'Maharashtra', lat: 18.7546, lng: 73.4062 },
  { name: 'Ambarnath', state: 'Maharashtra', lat: 19.2017, lng: 73.1916 },
  { name: 'Risod', state: 'Maharashtra', lat: 19.9670, lng: 76.7830 },
  { name: 'Raigad', state: 'Maharashtra', lat: 18.5360, lng: 73.1740 },
  { name: 'Vasai', state: 'Maharashtra', lat: 19.3919, lng: 72.8397 },
  { name: 'Nalasopara', state: 'Maharashtra', lat: 19.4221, lng: 72.8067 },
  { name: 'Dombivli', state: 'Maharashtra', lat: 19.2167, lng: 73.0833 },
  { name: 'Beed', state: 'Maharashtra', lat: 18.9889, lng: 75.7600 },
  { name: 'Gadchiroli', state: 'Maharashtra', lat: 20.1840, lng: 80.0030 },
  { name: 'Chikhli', state: 'Maharashtra', lat: 20.3500, lng: 76.2500 },
  { name: 'Nanded', state: 'Maharashtra', lat: 19.1500, lng: 77.3333 },
  // Gujarat
  { name: 'Himatnagar', state: 'Gujarat', lat: 23.5994, lng: 72.9656 },
  { name: 'Anjar', state: 'Gujarat', lat: 23.1166, lng: 70.0264 },
  { name: 'Gozariya', state: 'Gujarat', lat: 23.6500, lng: 72.5167 },
  { name: 'Palanpur', state: 'Gujarat', lat: 24.1722, lng: 72.4310 },
  { name: 'Khambhat', state: 'Gujarat', lat: 22.3050, lng: 72.6164 },
  { name: 'Ankleshwar', state: 'Gujarat', lat: 21.6266, lng: 73.0119 },
  { name: 'Dahod', state: 'Gujarat', lat: 22.8333, lng: 74.2667 },
  { name: 'Botad', state: 'Gujarat', lat: 22.1700, lng: 71.6700 },
  { name: 'Mahuva', state: 'Gujarat', lat: 21.0890, lng: 71.7710 },
  { name: 'Vyara', state: 'Gujarat', lat: 21.1085, lng: 73.4000 },
  { name: 'Godhra', state: 'Gujarat', lat: 22.7763, lng: 73.6213 },
  { name: 'Bharuch', state: 'Gujarat', lat: 21.7051, lng: 72.9959 },
  // Punjab
  { name: 'Samana', state: 'Punjab', lat: 30.1530, lng: 76.1933 },
  { name: 'Phillaur', state: 'Punjab', lat: 31.0257, lng: 75.7905 },
  { name: 'Fazilka', state: 'Punjab', lat: 30.4030, lng: 74.0270 },
  { name: 'Malout', state: 'Punjab', lat: 30.2059, lng: 74.4974 },
  { name: 'Budhlada', state: 'Punjab', lat: 29.9292, lng: 75.5645 },
  { name: 'Nakodar', state: 'Punjab', lat: 31.1262, lng: 75.4767 },
  { name: 'Nabha', state: 'Punjab', lat: 30.3743, lng: 76.1492 },
  { name: 'Firozpur', state: 'Punjab', lat: 30.9220, lng: 74.6132 },
  { name: 'Nangal', state: 'Punjab', lat: 31.3850, lng: 76.3700 },
  { name: 'Banur', state: 'Punjab', lat: 30.5571, lng: 76.7155 },
  { name: 'Sirhind', state: 'Punjab', lat: 30.6383, lng: 76.3838 },
  { name: 'Bhadaur', state: 'Punjab', lat: 30.4292, lng: 75.5072 },
  { name: 'Morinda', state: 'Punjab', lat: 30.7917, lng: 76.4944 },
  { name: 'Landra', state: 'Punjab', lat: 30.7234, lng: 76.6856 },
  // Haryana
  { name: 'Kaithal', state: 'Haryana', lat: 29.8014, lng: 76.3994 },
  { name: 'Pehowa', state: 'Haryana', lat: 29.9789, lng: 76.5867 },
  { name: 'Ganaur', state: 'Haryana', lat: 29.1416, lng: 77.0144 },
  { name: 'Kurukshetra', state: 'Haryana', lat: 29.9695, lng: 76.8783 },
  { name: 'Charkhi Dadri', state: 'Haryana', lat: 28.5897, lng: 76.2647 },
  { name: 'Safidon', state: 'Haryana', lat: 29.4053, lng: 76.6708 },
  { name: 'Loharu', state: 'Haryana', lat: 28.4292, lng: 75.8202 },
  { name: 'Narwana', state: 'Haryana', lat: 29.5878, lng: 76.1117 },
  { name: 'Barara', state: 'Haryana', lat: 30.3500, lng: 77.0833 },
  { name: 'Jhajjar', state: 'Haryana', lat: 28.6072, lng: 76.6566 },
  // Himachal Pradesh
  { name: 'Hamirpur', state: 'Himachal Pradesh', lat: 31.6845, lng: 76.5223 },
  { name: 'Kasauli', state: 'Himachal Pradesh', lat: 30.8985, lng: 76.9650 },
  { name: 'Sundarnagar', state: 'Himachal Pradesh', lat: 31.5283, lng: 76.9000 },
  { name: 'Mandi', state: 'Himachal Pradesh', lat: 31.7080, lng: 76.9320 },
  // Uttarakhand
  { name: 'Haldwani', state: 'Uttarakhand', lat: 29.2183, lng: 79.5130 },
  { name: 'Bazpur', state: 'Uttarakhand', lat: 29.1574, lng: 79.1052 },
  { name: 'Pauri', state: 'Uttarakhand', lat: 30.1469, lng: 78.7780 },
  { name: 'Kashipur', state: 'Uttarakhand', lat: 29.2104, lng: 78.9619 },
  { name: 'Gadarpur', state: 'Uttarakhand', lat: 28.9844, lng: 79.5044 },
  // Uttar Pradesh
  { name: 'Dibai', state: 'Uttar Pradesh', lat: 28.2150, lng: 78.2670 },
  { name: 'Padrauna', state: 'Uttar Pradesh', lat: 26.9000, lng: 83.9833 },
  { name: 'Mainpuri', state: 'Uttar Pradesh', lat: 27.2350, lng: 79.0250 },
  { name: 'Deoria', state: 'Uttar Pradesh', lat: 26.5024, lng: 83.7791 },
  { name: 'Chandausi', state: 'Uttar Pradesh', lat: 28.4500, lng: 78.7833 },
  { name: 'Khekada', state: 'Uttar Pradesh', lat: 28.8483, lng: 77.3208 },
  { name: 'Najibabad', state: 'Uttar Pradesh', lat: 29.6133, lng: 78.3431 },
  { name: 'Azamgarh', state: 'Uttar Pradesh', lat: 26.0683, lng: 83.1841 },
  { name: 'Etawah', state: 'Uttar Pradesh', lat: 26.7820, lng: 79.0150 },
  { name: 'Bijnor', state: 'Uttar Pradesh', lat: 29.3700, lng: 78.1300 },
  { name: 'Shikohabad', state: 'Uttar Pradesh', lat: 27.1075, lng: 78.5817 },
  { name: 'Shahjahanpur', state: 'Uttar Pradesh', lat: 27.8836, lng: 79.9051 },
  { name: 'Basti', state: 'Uttar Pradesh', lat: 26.8092, lng: 82.7390 },
  { name: 'Shishgarh', state: 'Uttar Pradesh', lat: 28.7383, lng: 79.1714 },
  { name: 'Vasundhara', state: 'Uttar Pradesh', lat: 28.6595, lng: 77.3625 },
  { name: 'Sahibabad', state: 'Uttar Pradesh', lat: 28.6739, lng: 77.3543 },
  { name: 'Nehtaur', state: 'Uttar Pradesh', lat: 29.3402, lng: 78.3870 },
  // Rajasthan
  { name: 'Chomu', state: 'Rajasthan', lat: 27.1664, lng: 75.7220 },
  { name: 'Dungarpur', state: 'Rajasthan', lat: 23.8430, lng: 73.7149 },
  { name: 'Abu Road', state: 'Rajasthan', lat: 24.4823, lng: 72.7807 },
  { name: 'Kishangarh', state: 'Rajasthan', lat: 26.5840, lng: 74.8638 },
  { name: 'Rajgarh', state: 'Madhya Pradesh', lat: 24.0085, lng: 76.7176 },
  { name: 'Mount Abu', state: 'Rajasthan', lat: 24.5926, lng: 72.7156 },
  { name: 'Sojat', state: 'Rajasthan', lat: 25.9215, lng: 73.6649 },
  { name: 'Jaisalmer', state: 'Rajasthan', lat: 26.9157, lng: 70.9083 },
  { name: 'Kekri', state: 'Rajasthan', lat: 25.9744, lng: 75.1494 },
  { name: 'Bhilwara', state: 'Rajasthan', lat: 25.3460, lng: 74.6364 },
  { name: 'Chittorgarh', state: 'Rajasthan', lat: 24.8770, lng: 74.6230 },
  { name: 'Bandikui', state: 'Rajasthan', lat: 27.0500, lng: 76.5667 },
  { name: 'Bhawanimandi', state: 'Rajasthan', lat: 24.4153, lng: 75.6422 },
  { name: 'Mahendragarh', state: 'Haryana', lat: 28.2770, lng: 76.1490 },
  // Madhya Pradesh
  { name: 'Balaghat', state: 'Madhya Pradesh', lat: 21.8077, lng: 80.1880 },
  { name: 'Katni', state: 'Madhya Pradesh', lat: 23.8343, lng: 80.3949 },
  { name: 'Sidhi', state: 'Madhya Pradesh', lat: 24.4029, lng: 81.8821 },
  { name: 'Ganj Basoda', state: 'Madhya Pradesh', lat: 23.8528, lng: 77.9333 },
  { name: 'Shivpuri', state: 'Madhya Pradesh', lat: 25.4252, lng: 77.6589 },
  { name: 'Morena', state: 'Madhya Pradesh', lat: 26.4960, lng: 77.9963 },
  { name: 'Guna', state: 'Madhya Pradesh', lat: 24.6500, lng: 77.3128 },
  { name: 'Bina', state: 'Madhya Pradesh', lat: 24.1810, lng: 78.1900 },
  { name: 'Betul', state: 'Madhya Pradesh', lat: 21.9038, lng: 77.8950 },
  { name: 'Maihar', state: 'Madhya Pradesh', lat: 24.2667, lng: 80.7500 },
  { name: 'Barwani', state: 'Madhya Pradesh', lat: 22.0345, lng: 74.9001 },
  { name: 'Ashta', state: 'Madhya Pradesh', lat: 23.0200, lng: 76.7100 },
  { name: 'Khargone', state: 'Madhya Pradesh', lat: 21.8243, lng: 75.6107 },
  // Chhattisgarh
  { name: 'Mahasamund', state: 'Chhattisgarh', lat: 21.1107, lng: 82.0967 },
  { name: 'Rajnandgaon', state: 'Chhattisgarh', lat: 21.0974, lng: 81.0379 },
  { name: 'Jagdalpur', state: 'Chhattisgarh', lat: 19.0876, lng: 82.0317 },
  { name: 'Dhamtari', state: 'Chhattisgarh', lat: 20.7080, lng: 81.5500 },
  // Note: Raigarh (CG) added here — distinct from Raigad (MH) above
  { name: 'Raigarh', state: 'Chhattisgarh', lat: 21.8974, lng: 83.3950 },
  // Bihar
  { name: 'Motihari', state: 'Bihar', lat: 26.6500, lng: 84.9167 },
  { name: 'Siwan', state: 'Bihar', lat: 26.2167, lng: 84.3500 },
  { name: 'Arrah', state: 'Bihar', lat: 25.5566, lng: 84.6691 },
  { name: 'Nawada', state: 'Bihar', lat: 24.8870, lng: 85.5435 },
  { name: 'Samastipur', state: 'Bihar', lat: 25.8628, lng: 85.7765 },
  { name: 'Kishanganj', state: 'Bihar', lat: 26.1083, lng: 87.9460 },
  { name: 'Dehri', state: 'Bihar', lat: 24.9026, lng: 84.1815 },
  { name: 'Banka', state: 'Bihar', lat: 24.8870, lng: 86.9220 },
  { name: 'Jamalpur', state: 'Bihar', lat: 25.3120, lng: 86.4906 },
  { name: 'Vaishali', state: 'Bihar', lat: 25.6800, lng: 85.3500 },
  // Jharkhand
  { name: 'Giridih', state: 'Jharkhand', lat: 24.1854, lng: 86.3100 },
  { name: 'Dumka', state: 'Jharkhand', lat: 24.2706, lng: 87.2495 },
  { name: 'Pakur', state: 'Jharkhand', lat: 24.6300, lng: 87.8500 },
  // West Bengal
  { name: 'Konnagar', state: 'West Bengal', lat: 22.7000, lng: 88.3500 },
  { name: 'Jalpaiguri', state: 'West Bengal', lat: 26.5167, lng: 88.7167 },
  { name: 'Darjeeling', state: 'West Bengal', lat: 27.0410, lng: 88.2663 },
  { name: 'Jhargram', state: 'West Bengal', lat: 22.4500, lng: 86.9833 },
  { name: 'Haldia', state: 'West Bengal', lat: 22.0257, lng: 88.0583 },
  // Odisha
  { name: 'Salipur', state: 'Odisha', lat: 20.5500, lng: 86.0167 },
  { name: 'Paralakhimundi', state: 'Odisha', lat: 18.7800, lng: 84.0900 },
  { name: 'Rajgangpur', state: 'Odisha', lat: 22.1815, lng: 84.5837 },
  { name: 'Bhadrak', state: 'Odisha', lat: 21.0574, lng: 86.4960 },
  { name: 'Sonepur', state: 'Odisha', lat: 20.8333, lng: 83.9167 },
  { name: 'Anugul', state: 'Odisha', lat: 20.8400, lng: 85.1011 },
  { name: 'Balugaon', state: 'Odisha', lat: 19.7500, lng: 85.1500 },
  { name: 'Talcher', state: 'Odisha', lat: 20.9472, lng: 85.2331 },
  { name: 'Baripada', state: 'Odisha', lat: 21.9333, lng: 86.7333 },
  { name: 'Kakatpur', state: 'Odisha', lat: 19.9667, lng: 86.1167 },
  // Assam
  { name: 'Bongaigaon', state: 'Assam', lat: 26.4823, lng: 90.5536 },
  // Karnataka
  { name: 'Puttur', state: 'Karnataka', lat: 12.7600, lng: 75.2000 },
  { name: 'Hospet', state: 'Karnataka', lat: 15.2693, lng: 76.3870 },
  { name: 'Hanamkonda', state: 'Telangana', lat: 18.0079, lng: 79.5651 },
  { name: 'Hassan', state: 'Karnataka', lat: 13.0073, lng: 76.0962 },
  { name: 'Ranebennur', state: 'Karnataka', lat: 14.6213, lng: 75.6296 },
  { name: 'Haveri', state: 'Karnataka', lat: 14.7950, lng: 75.4042 },
  { name: 'Bidar', state: 'Karnataka', lat: 17.9133, lng: 77.5300 },
  { name: 'Sindagi', state: 'Karnataka', lat: 16.9180, lng: 76.2380 },
  // Telangana
  { name: 'Zahirabad', state: 'Telangana', lat: 17.6803, lng: 77.6042 },
  { name: 'Godavarikhani', state: 'Telangana', lat: 18.7892, lng: 79.4444 },
  { name: 'Nirmal', state: 'Telangana', lat: 19.0980, lng: 78.3450 },
  { name: 'Siddipet', state: 'Telangana', lat: 18.1000, lng: 78.8500 },
  { name: 'Mancherial', state: 'Telangana', lat: 18.8714, lng: 79.4486 },
  // Kerala
  { name: 'Vaikom', state: 'Kerala', lat: 9.7500, lng: 76.4000 },
  { name: 'Tirur', state: 'Kerala', lat: 10.9170, lng: 75.9220 },
  { name: 'Nemmara', state: 'Kerala', lat: 10.6033, lng: 76.5950 },
  // Tamil Nadu
  { name: 'Rameswaram', state: 'Tamil Nadu', lat: 9.2876, lng: 79.3129 },
  { name: 'Perundurai', state: 'Tamil Nadu', lat: 11.2750, lng: 77.5810 },
  // Goa
  { name: 'Agonda', state: 'Goa', lat: 15.0407, lng: 73.9889 },
  { name: 'Ponda', state: 'Goa', lat: 15.4034, lng: 74.0156 },
  { name: 'Saverdem', state: 'Goa', lat: 15.0900, lng: 74.0500 },
  { name: 'Navelim', state: 'Goa', lat: 15.2667, lng: 73.9667 },
  // Misc
  { name: 'Shahdara', state: 'Delhi', lat: 28.6790, lng: 77.2900 },
  { name: 'Mehsana', state: 'Gujarat', lat: 23.6000, lng: 72.3833 },
  { name: 'Veraval', state: 'Gujarat', lat: 20.9070, lng: 70.3620 },
  { name: 'Bulandshahr', state: 'Uttar Pradesh', lat: 28.4067, lng: 77.8500 },
  { name: 'Raebareli', state: 'Uttar Pradesh', lat: 26.2308, lng: 81.2335 },
  { name: 'Orai', state: 'Uttar Pradesh', lat: 25.9914, lng: 79.4506 },

  // Sixth batch — drain pass 2026-06-21 (143-entry unmapped list)
  // Uttar Pradesh
  { name: 'Jaunpur', state: 'Uttar Pradesh', lat: 25.7333, lng: 82.6833 },
  { name: 'Hathras', state: 'Uttar Pradesh', lat: 27.5957, lng: 78.0518 },
  { name: 'Mahoba', state: 'Uttar Pradesh', lat: 25.2924, lng: 79.8730 },
  { name: 'Ghazipur', state: 'Uttar Pradesh', lat: 25.5876, lng: 83.5776 },
  { name: 'Farrukhabad', state: 'Uttar Pradesh', lat: 27.3919, lng: 79.5800 },
  { name: 'Kannauj', state: 'Uttar Pradesh', lat: 27.0550, lng: 79.9180 },
  { name: 'Kairana', state: 'Uttar Pradesh', lat: 29.3947, lng: 77.2050 },
  { name: 'Baraut', state: 'Uttar Pradesh', lat: 29.1027, lng: 77.2635 },
  { name: 'Baheri', state: 'Uttar Pradesh', lat: 28.7745, lng: 79.4969 },
  { name: 'Budaun', state: 'Uttar Pradesh', lat: 28.0360, lng: 79.1280 },
  { name: 'Pilibhit', state: 'Uttar Pradesh', lat: 28.6315, lng: 79.8044 },
  { name: 'Ballia', state: 'Uttar Pradesh', lat: 25.7585, lng: 84.1495 },
  { name: 'Lakhimpur Kheri', state: 'Uttar Pradesh', lat: 27.9484, lng: 80.7790 },
  // Bihar
  { name: 'Sitamarhi', state: 'Bihar', lat: 26.5946, lng: 85.4905 },
  { name: 'Runnisaidpur', state: 'Bihar', lat: 26.3833, lng: 85.4833 },
  { name: 'Madhubani', state: 'Bihar', lat: 26.3486, lng: 86.0716 },
  { name: 'Gopalganj', state: 'Bihar', lat: 26.4682, lng: 84.4336 },
  { name: 'Raxaul', state: 'Bihar', lat: 26.9810, lng: 84.8497 },
  // Jharkhand
  { name: 'Simdega', state: 'Jharkhand', lat: 22.6168, lng: 84.5142 },
  { name: 'Godda', state: 'Jharkhand', lat: 24.8270, lng: 87.2130 },
  // Rajasthan
  { name: 'Tonk', state: 'Rajasthan', lat: 26.1505, lng: 75.7855 },
  { name: 'Nagaur', state: 'Rajasthan', lat: 27.1989, lng: 73.7399 },
  { name: 'Bhinmal', state: 'Rajasthan', lat: 25.0061, lng: 72.2647 },
  { name: 'Balotra', state: 'Rajasthan', lat: 25.8333, lng: 72.2400 },
  { name: 'Bijainagar', state: 'Rajasthan', lat: 25.9276, lng: 74.6330 },
  // Madhya Pradesh
  { name: 'Chhatarpur', state: 'Madhya Pradesh', lat: 24.9180, lng: 79.5880 },
  { name: 'Datia', state: 'Madhya Pradesh', lat: 25.6660, lng: 78.4600 },
  { name: 'Neemuch', state: 'Madhya Pradesh', lat: 24.4760, lng: 74.8720 },
  { name: 'Khurai', state: 'Madhya Pradesh', lat: 24.0420, lng: 78.3320 },
  { name: 'Parasia', state: 'Madhya Pradesh', lat: 22.1920, lng: 78.7570 },
  { name: 'Katangi', state: 'Madhya Pradesh', lat: 21.7720, lng: 79.8000 },
  { name: 'Waidhan', state: 'Madhya Pradesh', lat: 24.0730, lng: 82.6470 },
  { name: 'Umaria', state: 'Madhya Pradesh', lat: 23.5240, lng: 80.8370 },
  // Maharashtra
  { name: 'Washim', state: 'Maharashtra', lat: 20.1110, lng: 77.1330 },
  { name: 'Jalna', state: 'Maharashtra', lat: 19.8410, lng: 75.8860 },
  { name: 'Miraj', state: 'Maharashtra', lat: 16.8290, lng: 74.6420 },
  { name: 'Gondia', state: 'Maharashtra', lat: 21.4624, lng: 80.1920 },
  { name: 'Umred', state: 'Maharashtra', lat: 20.8500, lng: 79.3300 },
  { name: 'Malvan', state: 'Maharashtra', lat: 16.0590, lng: 73.4710 },
  { name: 'Kopargaon', state: 'Maharashtra', lat: 19.8820, lng: 74.4760 },
  { name: 'Karjat', state: 'Maharashtra', lat: 18.9107, lng: 73.3239 },
  { name: 'Omerga', state: 'Maharashtra', lat: 17.8400, lng: 76.6200 },
  { name: 'Takeghoti', state: 'Maharashtra', lat: 19.6920, lng: 73.5520 },
  { name: 'Kolgaon', state: 'Maharashtra', lat: 18.6170, lng: 74.6970 },
  { name: 'Daryapur', state: 'Maharashtra', lat: 20.9270, lng: 77.3270 },
  { name: 'Parbhani', state: 'Maharashtra', lat: 19.2686, lng: 76.7700 },
  // Goa
  { name: 'Valpoi', state: 'Goa', lat: 15.5320, lng: 74.1370 },
  // Gujarat
  { name: 'Morbi', state: 'Gujarat', lat: 22.8170, lng: 70.8370 },
  { name: 'Patan', state: 'Gujarat', lat: 23.8500, lng: 72.1260 },
  { name: 'Surendranagar', state: 'Gujarat', lat: 22.7280, lng: 71.6370 },
  // Dadra and Nagar Haveli
  { name: 'Silvassa', state: 'Dadra and Nagar Haveli', lat: 20.2700, lng: 73.0170 },
  // Punjab
  { name: 'Ropar', state: 'Punjab', lat: 30.9660, lng: 76.5270 },
  { name: 'Sirsa', state: 'Haryana', lat: 29.5349, lng: 75.0280 },
  { name: 'Batala', state: 'Punjab', lat: 31.8186, lng: 75.2028 },
  { name: 'Mukerian', state: 'Punjab', lat: 31.9540, lng: 75.6170 },
  { name: 'Rayya', state: 'Punjab', lat: 31.5670, lng: 75.0080 },
  { name: 'Moonak', state: 'Punjab', lat: 29.8330, lng: 75.8830 },
  { name: 'Raikot', state: 'Punjab', lat: 30.6510, lng: 75.6050 },
  { name: 'Kot Ise Khan', state: 'Punjab', lat: 31.1170, lng: 75.2670 },
  { name: 'Bhiwani', state: 'Haryana', lat: 28.7930, lng: 76.1390 },
  // Uttarakhand
  { name: 'Ramnagar', state: 'Uttarakhand', lat: 29.3970, lng: 79.1290 },
  { name: 'Kichha', state: 'Uttarakhand', lat: 28.9120, lng: 79.5210 },
  // Jammu & Kashmir / Ladakh
  { name: 'Rajouri', state: 'Jammu & Kashmir', lat: 33.3776, lng: 74.3100 },
  { name: 'Banihal', state: 'Jammu & Kashmir', lat: 33.4350, lng: 75.1960 },
  { name: 'Awantipora', state: 'Jammu & Kashmir', lat: 33.9180, lng: 75.0150 },
  { name: 'Katra', state: 'Jammu & Kashmir', lat: 32.9917, lng: 74.9319 },
  { name: 'Kargil', state: 'Ladakh', lat: 34.5539, lng: 76.1349 },
  { name: 'Leh', state: 'Ladakh', lat: 34.1526, lng: 77.5771 },
  // West Bengal
  { name: 'Malda', state: 'West Bengal', lat: 25.0119, lng: 88.1433 },
  { name: 'Cooch Behar', state: 'West Bengal', lat: 26.3220, lng: 89.4520 },
  { name: 'Basirhat', state: 'West Bengal', lat: 22.6570, lng: 88.8940 },
  { name: 'Barrackpore', state: 'West Bengal', lat: 22.7600, lng: 88.3700 },
  { name: 'Raniganj', state: 'West Bengal', lat: 23.6200, lng: 87.1290 },
  // Odisha
  { name: 'Sundargarh', state: 'Odisha', lat: 22.1170, lng: 84.0330 },
  { name: 'Rayagada', state: 'Odisha', lat: 19.1710, lng: 83.4160 },
  { name: 'Jatani', state: 'Odisha', lat: 20.1670, lng: 85.7000 },
  { name: 'Balasore', state: 'Odisha', lat: 21.4942, lng: 86.9336 },
  { name: 'Khordha', state: 'Odisha', lat: 20.1820, lng: 85.6160 },
  { name: 'Bhawanipatna', state: 'Odisha', lat: 19.9070, lng: 83.1670 },
  // Assam
  { name: 'Tinsukia', state: 'Assam', lat: 27.4922, lng: 95.3468 },
  // Karnataka
  { name: 'Raichur', state: 'Karnataka', lat: 16.2076, lng: 77.3463 },
  { name: 'Gadag', state: 'Karnataka', lat: 15.4310, lng: 75.6300 },
  { name: 'Hunsur', state: 'Karnataka', lat: 12.3030, lng: 76.2930 },
  { name: 'Guntakal', state: 'Andhra Pradesh', lat: 15.1710, lng: 77.3660 },
  { name: 'Chikkamagaluru', state: 'Karnataka', lat: 13.3160, lng: 75.7720 },
  { name: 'Kushalnagar', state: 'Karnataka', lat: 12.4570, lng: 75.9610 },
  { name: 'Kinnigoli', state: 'Karnataka', lat: 13.0670, lng: 74.9330 },
  { name: 'Ballari', state: 'Karnataka', lat: 15.1394, lng: 76.9214 },
  // Telangana
  { name: 'Kamareddy', state: 'Telangana', lat: 18.3200, lng: 78.3370 },
  { name: 'Tandur', state: 'Telangana', lat: 17.2410, lng: 77.5780 },
  { name: 'Mahabubnagar', state: 'Telangana', lat: 16.7480, lng: 77.9850 },
  { name: 'Nalgonda', state: 'Telangana', lat: 17.0540, lng: 79.2670 },
  // Andhra Pradesh
  { name: 'Srikakulam', state: 'Andhra Pradesh', lat: 18.2949, lng: 83.8938 },
  { name: 'Rajahmundry', state: 'Andhra Pradesh', lat: 16.9891, lng: 81.7837 },
  { name: 'Piduguralla', state: 'Andhra Pradesh', lat: 16.4920, lng: 79.8870 },
  // Tamil Nadu
  { name: 'Thanjavur', state: 'Tamil Nadu', lat: 10.7870, lng: 79.1378 },
  { name: 'Tirumangalam', state: 'Tamil Nadu', lat: 9.8230, lng: 77.9890 },
  { name: 'Kallakurichi', state: 'Tamil Nadu', lat: 11.7380, lng: 78.9590 },
  { name: 'Chengalpattu', state: 'Tamil Nadu', lat: 12.6920, lng: 79.9760 },
  { name: 'Kalpakkam', state: 'Tamil Nadu', lat: 12.5240, lng: 80.1750 },
  { name: 'Yercaud', state: 'Tamil Nadu', lat: 11.7750, lng: 78.2090 },
  // Kerala
  { name: 'Pathanamthitta', state: 'Kerala', lat: 9.2648, lng: 76.7870 },
  // Foreign cities (state = country; resolve but plot outside India bounds)
  { name: 'Paris', state: 'France', lat: 48.8566, lng: 2.3522 },
  { name: 'Bangkok', state: 'Thailand', lat: 13.7563, lng: 100.5018 },

  // Seventh batch — drain pass 2026-07-19 (129-entry unmapped list)
  // North
  { name: 'Hoshiarpur', state: 'Punjab', lat: 31.5273, lng: 75.9115 },
  { name: 'Sangrur', state: 'Punjab', lat: 30.2458, lng: 75.8421 },
  { name: 'Khanna', state: 'Punjab', lat: 30.7057, lng: 76.2211 },
  { name: 'Rajpura', state: 'Punjab', lat: 30.4840, lng: 76.5940 },
  { name: 'Dasuya', state: 'Punjab', lat: 31.8170, lng: 75.6530 },
  { name: 'Doraha', state: 'Punjab', lat: 30.8000, lng: 76.0333 },
  { name: 'Kurali', state: 'Punjab', lat: 30.8340, lng: 76.5810 },
  { name: 'Mukandpur', state: 'Punjab', lat: 31.2400, lng: 75.6300 },
  { name: 'Tarn Taran', state: 'Punjab', lat: 31.4519, lng: 74.9278 },
  { name: 'Narnaul', state: 'Haryana', lat: 28.0444, lng: 76.1056 },
  { name: 'Assandh', state: 'Haryana', lat: 29.5216, lng: 76.6052 },
  { name: 'Ellenabad', state: 'Haryana', lat: 29.4522, lng: 74.6614 },
  { name: 'Farrukhnagar', state: 'Haryana', lat: 28.4489, lng: 76.8226 },
  { name: 'Jagadhri', state: 'Haryana', lat: 30.1670, lng: 77.3000 },
  { name: 'Sohna', state: 'Haryana', lat: 28.2478, lng: 77.0658 },
  { name: 'Tohana', state: 'Haryana', lat: 29.7130, lng: 75.9040 },
  { name: 'Sunder Nagar', state: 'Himachal Pradesh', lat: 31.5350, lng: 76.8850 },
  { name: 'Vikasnagar', state: 'Uttarakhand', lat: 30.4680, lng: 77.7740 },
  // UP + Bihar + Jharkhand
  { name: 'Ayodhya', state: 'Uttar Pradesh', lat: 26.7922, lng: 82.1998 },
  { name: 'Khurja', state: 'Uttar Pradesh', lat: 28.2514, lng: 77.8551 },
  { name: 'Muradnagar', state: 'Uttar Pradesh', lat: 28.7792, lng: 77.4988 },
  { name: 'Lalitpur', state: 'Uttar Pradesh', lat: 24.6883, lng: 78.4128 },
  { name: 'Jalaun', state: 'Uttar Pradesh', lat: 26.1460, lng: 79.3350 },
  { name: 'Pilibhit', state: 'Uttar Pradesh', lat: 28.6310, lng: 79.8040 },
  { name: 'Puranpur', state: 'Uttar Pradesh', lat: 28.5140, lng: 80.1480 },
  { name: 'Barsana', state: 'Uttar Pradesh', lat: 27.6483, lng: 77.3767 },
  { name: 'Bihta', state: 'Bihar', lat: 25.5560, lng: 84.8700 },
  { name: 'Fatuha', state: 'Bihar', lat: 25.5100, lng: 85.3050 },
  { name: 'Sasaram', state: 'Bihar', lat: 24.9569, lng: 84.0300 },
  { name: 'Deoghar', state: 'Jharkhand', lat: 24.4826, lng: 86.6906 },
  { name: 'Daltonganj', state: 'Jharkhand', lat: 24.0400, lng: 84.0700 },
  // West Bengal + Northeast + Odisha
  { name: 'Bankura', state: 'West Bengal', lat: 23.2325, lng: 87.0691 },
  { name: 'Bardhaman', state: 'West Bengal', lat: 23.2324, lng: 87.8615 },
  { name: 'Barasat', state: 'West Bengal', lat: 22.7228, lng: 88.4800 },
  { name: 'Contai', state: 'West Bengal', lat: 21.7780, lng: 87.7530 },
  { name: 'Dhulian', state: 'West Bengal', lat: 24.6800, lng: 87.9600 },
  { name: 'Dubrajpur', state: 'West Bengal', lat: 23.7950, lng: 87.3770 },
  { name: 'Kharagpur', state: 'West Bengal', lat: 22.3460, lng: 87.2320 },
  { name: 'Krishnanagar', state: 'West Bengal', lat: 23.4058, lng: 88.5019 },
  { name: 'Midnapore', state: 'West Bengal', lat: 22.4240, lng: 87.3190 },
  { name: 'Alipurduar', state: 'West Bengal', lat: 26.4837, lng: 89.5667 },
  { name: 'Golaghat', state: 'Assam', lat: 26.5240, lng: 93.9700 },
  { name: 'Karimganj', state: 'Assam', lat: 24.8649, lng: 92.3592 },
  { name: 'Silchar', state: 'Assam', lat: 24.8333, lng: 92.7789 },
  { name: 'Tezpur', state: 'Assam', lat: 26.6338, lng: 92.8000 },
  { name: 'Roing', state: 'Arunachal Pradesh', lat: 28.1445, lng: 95.8369 },
  { name: 'Bargarh', state: 'Odisha', lat: 21.3344, lng: 83.6190 },
  { name: 'Bhanjanagar', state: 'Odisha', lat: 19.9270, lng: 84.5820 },
  { name: 'Brajrajnagar', state: 'Odisha', lat: 21.8167, lng: 83.9167 },
  { name: 'Keonjhar', state: 'Odisha', lat: 21.6289, lng: 85.5817 },
  { name: 'Khariar', state: 'Odisha', lat: 20.2900, lng: 82.7600 },
  // Central + West
  { name: 'Ratlam', state: 'Madhya Pradesh', lat: 23.3315, lng: 75.0367 },
  { name: 'Mandsaur', state: 'Madhya Pradesh', lat: 24.0768, lng: 75.0700 },
  { name: 'Singrauli', state: 'Madhya Pradesh', lat: 24.1990, lng: 82.6750 },
  { name: 'Khairagarh', state: 'Chhattisgarh', lat: 21.4180, lng: 80.9790 },
  { name: 'Nadiad', state: 'Gujarat', lat: 22.6916, lng: 72.8634 },
  { name: 'Navsari', state: 'Gujarat', lat: 20.9467, lng: 72.9520 },
  { name: 'Dhoraji', state: 'Gujarat', lat: 21.7337, lng: 70.4500 },
  { name: 'Sayla', state: 'Gujarat', lat: 22.5460, lng: 71.4800 },
  { name: 'Nawalgarh', state: 'Rajasthan', lat: 27.8510, lng: 75.2730 },
  { name: 'Pushkar', state: 'Rajasthan', lat: 26.4897, lng: 74.5511 },
  // Maharashtra + Goa
  { name: 'Bhandara', state: 'Maharashtra', lat: 21.1667, lng: 79.6500 },
  { name: 'Boisar', state: 'Maharashtra', lat: 19.8023, lng: 72.7583 },
  { name: 'Palghar', state: 'Maharashtra', lat: 19.6970, lng: 72.7654 },
  { name: 'Hingoli', state: 'Maharashtra', lat: 19.7173, lng: 77.1494 },
  { name: 'Sinnar', state: 'Maharashtra', lat: 19.8450, lng: 74.0000 },
  { name: 'Tasgaon', state: 'Maharashtra', lat: 17.0370, lng: 74.6030 },
  { name: 'Karad', state: 'Maharashtra', lat: 17.2900, lng: 74.1800 },
  { name: 'Ratnagiri', state: 'Maharashtra', lat: 16.9902, lng: 73.3120 },
  { name: 'Kankavli', state: 'Maharashtra', lat: 16.2667, lng: 73.7167 },
  { name: 'Anjangaon', state: 'Maharashtra', lat: 21.1652, lng: 77.3089 },
  { name: 'Vasco da Gama', state: 'Goa', lat: 15.3860, lng: 73.8440 },
  // South
  { name: 'Erode', state: 'Tamil Nadu', lat: 11.3410, lng: 77.7172 },
  { name: 'Dindigul', state: 'Tamil Nadu', lat: 10.3624, lng: 77.9695 },
  { name: 'Karur', state: 'Tamil Nadu', lat: 10.9601, lng: 78.0766 },
  { name: 'Nagercoil', state: 'Tamil Nadu', lat: 8.1780, lng: 77.4280 },
  { name: 'Sivakasi', state: 'Tamil Nadu', lat: 9.4533, lng: 77.8024 },
  { name: 'Gummidipoondi', state: 'Tamil Nadu', lat: 13.4075, lng: 80.1088 },
  { name: 'Harihar', state: 'Karnataka', lat: 14.5128, lng: 75.8069 },
  { name: 'Mandya', state: 'Karnataka', lat: 12.5223, lng: 76.8954 },
  { name: 'Kolar', state: 'Karnataka', lat: 13.1360, lng: 78.1290 },
  { name: 'Allagadda', state: 'Andhra Pradesh', lat: 15.1310, lng: 78.5138 },
  { name: 'Kavali', state: 'Andhra Pradesh', lat: 14.9130, lng: 79.9930 },
  { name: 'Palakollu', state: 'Andhra Pradesh', lat: 16.5167, lng: 81.7333 },
  { name: 'Shadnagar', state: 'Telangana', lat: 17.0700, lng: 78.2000 },
  { name: 'Changanacherry', state: 'Kerala', lat: 9.4425, lng: 76.5361 },
  { name: 'Kottayam', state: 'Kerala', lat: 9.5916, lng: 76.5222 },
  { name: 'Palakkad', state: 'Kerala', lat: 10.7867, lng: 76.6548 },
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
  'pondicherry': 'Puducherry', 'puducherry': 'Puducherry',
  'nellore': 'Nellore', 'kakinada': 'Vijayawada',

  // Third-batch aliases (2026-05-30)
  'lko': 'Lucknow',
  // Fourth-batch aliases — Q2 2026
  'panjim': 'Panaji',
  'bangluru': 'Bangalore',
  'maunath bhanjan': 'Mau',
  'maunathbhanjan': 'Mau',
  'kalaburagi': 'Gulbarga',

  // Misspellings of existing cities (2026-05-30 unmapped batch)
  'gauhati': 'Guwahati',
  'ahemdabad': 'Ahmedabad',
  'amdavad': 'Ahmedabad',
  'ahmadabad': 'Ahmedabad',

  // Fifth-batch aliases — drain pass 2026-05-30
  // Typos → canonical city names
  'bngalore': 'Bangalore',
  'gurgram': 'Gurgaon',
  'bhubneswar': 'Bhubaneswar',
  'ahmedbad': 'Ahmedabad',
  'kanpr': 'Kanpur',
  'cawnpore': 'Kanpur',
  'hyedrabad': 'Hyderabad',
  'ghazibad': 'Ghaziabad',
  'gzb': 'Ghaziabad',
  'vasi': 'Vasai',
  'bbsr': 'Bhubaneswar',
  'gudgaon': 'Gurgaon',
  'vododara': 'Vadodara',
  'kalaburgi': 'Gulbarga',
  'bhavangar': 'Bhavnagar',
  'ankleshwer': 'Ankleshwar',
  'pkl': 'Panchkula',
  'gj': 'Ahmedabad',
  'purnea': 'Purnia',
  'firazpur': 'Firozpur',
  'sahibabad': 'Ghaziabad',
  'mira road': 'Mira Road',
  'miraroad': 'Mira Road',
  'tricity': 'Chandigarh',
  'palava dombiwali': 'Dombivli',
  'mandi himachal': 'Mandi',
  'chittaurgarh': 'Chittorgarh',
  'rath hamirpur': 'Hamirpur',
  'anu hamirpur': 'Hamirpur',
  'ramgarh kurukshetra': 'Kurukshetra',
  'subhash nagar': 'Delhi',
  'gautam buddha nagar': 'Noida',
  'gir somanath': 'Veraval',
  'mussafah sahbyia 9': 'Mussafah',
  'india dahod': 'Dahod',
  'pali mahendergarh': 'Mahendragarh',
  'kashmir': 'Srinagar',
  'krishna': 'Vijayawada',
  'angul': 'Anugul',

  // Seventh-batch aliases — drain pass 2026-07-19
  // Typos → canonical
  'gautam bhuddha nagar': 'Noida',
  'bangaolre': 'Bangalore',
  'bhatinda': 'Bathinda',
  'jamsedpur': 'Jamshedpur',
  'ludhians': 'Ludhiana',
  'ferozepore': 'Firozpur',
  'guwahti': 'Guwahati',
  'pilibiit': 'Pilibhit',
  'taran tarn': 'Tarn Taran',
  'tumakuru': 'Tumkur',
  'burdwan': 'Bardhaman',
  'kendujhar': 'Keonjhar',
  'dhuliyan': 'Dhulian',
  'anjangavo surji': 'Anjangaon',
  // Renames / districts → their hub city
  'ahilyanagar': 'Ahmednagar',
  'palamu': 'Daltonganj',
  'paschim mednipur': 'Midnapore',
  'nadia': 'Krishnanagar',
  'ranga reddy': 'Hyderabad',
  // Metro localities → metro
  'aliganj': 'Lucknow',
  'narela': 'Delhi',
  'powai': 'Mumbai',
  'kalamboli': 'Mumbai',
  'yelahanka': 'Bangalore',
  'pallikaranai': 'Chennai',
  'park hinjawadi': 'Pune',
  'shamshabad': 'Hyderabad',
  'keesara': 'Hyderabad',
  'liluah': 'Howrah',
  'titagarh': 'Kolkata',
  'rangirkhari': 'Silchar',
  'old saram': 'Puducherry',
  'bidare': 'Bidar',
  'gadchoroli': 'Gadchiroli',
  'manchireya': 'Mancherial',
  'bhayander east': 'Bhayander',
  'bhayander west': 'Bhayander',
  'kandivali east': 'Kandivali',
  'kandivali west': 'Kandivali',
  'nalasopara east': 'Nalasopara',
  'nalasopara west': 'Nalasopara',
  'borivali east': 'Mumbai',
  'borivali west': 'Mumbai',
  'andheri east': 'Mumbai',
  'andheri west': 'Mumbai',
  'himmatnagar': 'Himatnagar',
  'dehri on sone': 'Dehri',
  'dehri-on-sone': 'Dehri',
  'mehsana2': 'Mehsana',
  'mumbra kausa': 'Thane',
  'chandousi muradabad': 'Moradabad',
  'begusaria': 'Begusarai',
  'bhir': 'Beed',
  'hanmakonda': 'Hanamkonda',
  'hanumakonda': 'Hanamkonda',
  'nehtour': 'Nehtaur',
  'mh': 'Mumbai',
  'baraily': 'Bareilly',
  'bhubaneswar': 'Bhubaneswar',
  'chittorgarh': 'Chittorgarh',

  // Sixth-batch aliases — drain pass 2026-06-21
  // Misspellings / alt spellings → canonical
  'ujjian': 'Ujjain',
  'sonepat': 'Sonipat',
  'godhara': 'Godhra',
  'shikohibed': 'Shikohabad',
  'davenger': 'Davanagere',
  'davanger': 'Davanagere',
  'davangere': 'Davanagere',
  'parabhani': 'Parbhani',
  'nalginda': 'Nalgonda',
  'bhiwnai': 'Bhiwani',
  'rajauri': 'Rajouri',
  'ludhina': 'Ludhiana',
  'badaun': 'Budaun',
  'bulandshahar': 'Bulandshahr',
  'bhubneshwar': 'Bhubaneswar',
  'benguluru': 'Bengaluru',
  'bangaluru': 'Bengaluru',
  'bellari': 'Ballari',
  'bellary': 'Ballari',
  'baleshwar': 'Balasore',
  'darypur': 'Daryapur',            // unicode-stylized 𝔻𝕒𝕣𝕪𝕡𝕦𝕣 normalizes to "Darypur"
  'sambhajinagar': 'Aurangabad',    // renamed: Aurangabad → Chhatrapati Sambhajinagar (2023)
  // Renamed / old names
  'rupnagar': 'Ropar',
  'osmanabad': 'Omerga',
  // Compound / district-qualified inputs → the town
  'muradabad patti': 'Moradabad',
  'nagaur marwar': 'Nagaur',
  'tonk todaraisingh': 'Tonk',
  'ahorejalore': 'Bhinmal',         // "Ahore/jalore" → slash stripped on clean; both in Jalore dist
  'kotisekhan': 'Kot Ise Khan',     // "Kot-Ise-Khan" → hyphens stripped to a single token on clean
  'wayanad': 'Kozhikode',           // Wayanad district (Kerala) → nearest mapped city
  'kalahandi': 'Bhawanipatna',      // Kalahandi district (Odisha) → district HQ Bhawanipatna
  'gallops hotel': 'Ahmedabad',     // Gallops is a hospitality complex in Ahmedabad
  'leh ladakh': 'Leh',
  // Localities / suburbs → parent city
  'kurla': 'Mumbai',
  'kharghar': 'Mumbai',             // Navi Mumbai satellite
  'magarpatta': 'Pune',
  'krpuram': 'Bangalore',
  'mansrovar': 'Jaipur',
  'najafgarh': 'Delhi',
  'gandimaisamma': 'Hyderabad',
  'narsingi': 'Hyderabad',
  'dichipally': 'Hyderabad',
  'sodepur': 'Kolkata',
  'dombivali': 'Dombivli',          // spelling variant of existing Dombivli

  // State-name-as-city fallbacks — route to state capital so leads aren't lost
  'bihar': 'Patna',
  'maharashtra': 'Mumbai',
  'mahareshtra': 'Mumbai',
  'gujarat': 'Ahmedabad',
  'punjab': 'Chandigarh',
  'haryana': 'Chandigarh',
  'karnataka': 'Bangalore',
  'tamil nadu': 'Chennai',
  'tamilnadu': 'Chennai',
  'kerala': 'Thiruvananthapuram',
  'rajasthan': 'Jaipur',
  'rajesthan': 'Jaipur',
  'uttar pradesh': 'Lucknow',
  'uttarpradesh': 'Lucknow',
  'up': 'Lucknow',
  'west bengal': 'Kolkata',
  'westbengal': 'Kolkata',
  'wb': 'Kolkata',
  'andhra pradesh': 'Hyderabad',
  'andhrapradesh': 'Hyderabad',
  'ap': 'Hyderabad',
  'telangana': 'Hyderabad',
  'ts': 'Hyderabad',
  'madhya pradesh': 'Bhopal',
  'madhyapradesh': 'Bhopal',
  'mp': 'Bhopal',
  'chhattisgarh': 'Raipur',
  'odisha': 'Bhubaneswar',
  'orissa': 'Bhubaneswar',
  'jharkhand': 'Ranchi',
  'assam': 'Guwahati',
  'uttarakhand': 'Dehradun',
  'himachal pradesh': 'Shimla',
  'himachalpradesh': 'Shimla',
  'hp': 'Shimla',
  'goa': 'Panaji',
}

/**
 * Fuzzy match a city name to known coordinates.
 * Tries: exact → alias → substring → word overlap.
 */
export function findCity(name: string): CityCoord | null {
  if (!name) return null
  const clean = name.trim().toLowerCase().replace(/[^a-z\s]/g, '').trim()
  if (!clean) return null

  // 0. Strip parenthetical descriptors: "Anaval (unai)" → "Anaval"
  const noParens = clean.replace(/\([^)]*\)/g, '').trim()
  if (noParens && noParens !== clean) {
    const parensMatch = INDIA_CITIES.find(c => c.name.toLowerCase() === noParens)
    if (parensMatch) return parensMatch
  }

  // 1. Exact match
  const exact = INDIA_CITIES.find(c => c.name.toLowerCase() === clean)
  if (exact) return exact

  // 1b. Try collapsing all whitespace and matching exactly
  //     (handles "Dehra Dun" → "Dehradun", "Navi Mumbai" → "NaviMumbai" etc.)
  const collapsed = clean.replace(/\s+/g, '')
  if (collapsed && collapsed !== clean) {
    const collapsedMatch = INDIA_CITIES.find(c => c.name.toLowerCase().replace(/\s+/g, '') === collapsed)
    if (collapsedMatch) return collapsedMatch
    const collapsedAlias = CITY_ALIASES[collapsed]
    if (collapsedAlias) {
      const found = INDIA_CITIES.find(c => c.name === collapsedAlias)
      if (found) return found
    }
  }

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

// ─── Foreign-city and junk-value filters ─────────────────────────────────

/**
 * Known foreign cities — legitimate leads from outside India.
 * These won't appear on the India heatmap (out of bounds) but
 * shouldn't pollute the "Unmapped cities" warning either.
 */
const KNOWN_FOREIGN_CITIES = new Set([
  'dubai', 'abu dhabi', 'sharjah', 'doha', 'kuwait', 'kuwait city',
  'singapore', 'london', 'manchester', 'new york', 'toronto', 'sydney',
  'melbourne', 'auckland', 'kathmandu', 'colombo', 'dhaka', 'kuala lumpur',
  // Fifth-batch additions
  'mussafah', 'mussafah sahbyia 9', 'kuala',
  // Seventh-batch additions (2026-07-19)
  'pinner', // London suburb
])

export function isKnownForeign(name: string | null | undefined): boolean {
  if (!name) return false
  return KNOWN_FOREIGN_CITIES.has(name.trim().toLowerCase())
}

/**
 * Placeholder / junk values frequently typed into a city field —
 * not real cities, not worth surfacing as "unmapped".
 */
const JUNK_CITY_VALUES = new Set([
  'others', 'other', 'na', 'n/a', 'none', 'nil', 'unknown', 'tbd',
  'pan india', 'all india', 'india', 'pan-india', 'all-india',
  '-', '--', '?', '...', 'xxx',
  'bhat gam', 'bhatgam', 'call me',
  // Fifth-batch additions
  'jjjj', 'goksj', 'gyrgson', 'pu e', 'yes', 'shashi', 'rehan',
  'anaval (unai)',
  // Seventh-batch additions (2026-07-19)
  'not specified', 'a to z', 'bbb', 'ghazi aunty', 'lecee', 'north g',
  'status', 'tejagnt59@gmail.com', 'bolaro', 'madarpur', 'kasari', 'khanpur',
])

export function isJunkCityValue(name: string | null | undefined): boolean {
  if (!name) return true
  return JUNK_CITY_VALUES.has(name.trim().toLowerCase())
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

// ─── Input-quality helpers (drain-pass 2026-05-30) ───────────────────────────

/**
 * Detect inputs that are mostly digits (phone numbers, pincodes, postal codes).
 * These are never valid city names — always junk.
 */
export function isLikelyPhoneOrPincode(name: string | null | undefined): boolean {
  if (!name) return false
  const stripped = name.replace(/[\s+\-()]/g, '')
  if (!stripped) return false
  // Pure digits, 4+ chars (covers pincodes [6 digits] and phone fragments)
  if (/^\d{4,}$/.test(stripped)) return true
  // Mostly digits (≥70% of chars are digits)
  const digits = stripped.match(/\d/g)?.length ?? 0
  return digits / stripped.length >= 0.7 && stripped.length >= 4
}

/**
 * Detect Devanagari or other non-Latin scripts.
 * These can't match our Latin-script city list — treat as unmappable.
 */
export function isNonLatinScript(name: string | null | undefined): boolean {
  if (!name) return false
  // Devanagari + Bengali + Tamil + Telugu + Kannada + Malayalam + Gurmukhi + Gujarati + Oriya
  return /[ऀ-ॿঀ-৿઀-૿଀-୿஀-௿ఀ-౿ಀ-೿ഀ-ൿ਀-੿]/.test(name)
}

/**
 * Normalize mathematical/stylized Unicode (e.g. 𝔻𝕒𝕣𝕪𝕡𝕦𝕣) to plain ASCII
 * via NFKD decomposition, stripping non-ASCII residue.
 * Use this as a fallback when findCity returns null.
 */
export function unicodeNormalize(name: string): string {
  if (!name) return name
  return name.normalize('NFKD').replace(/[^\x00-\x7F]/g, '')
}
